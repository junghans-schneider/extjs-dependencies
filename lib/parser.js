// Parses Ext JS source code and extracts defined classes and dependencies.
//
// This parser was originally written by Rowan Crawford and Christofer Pak
// for https://github.com/cpak/grunt-extjs-dependencies (commit 775fd22 from 2013-11-15)
//
// Copyright (c) 2013 christoferpak@gmail.com
// Copyright (c) 2016 Junghans und Schneider


'use strict';

var path = require('path'),
    falafel = require('falafel'),
    minimatch = require('minimatch'),
    extend = require('extend'),
    trim = require('trim'),
    defaultLogger = require('./logger');


function ExtFile(params) {
    this.names = params.names;
    this.parentName = params.parentName;
    this.aliasNames = params.aliasNames;
    this.requires = params.requires || [];
    this.uses = params.uses || [];
    this.src = params.src;
    this.path = params.path;
}


var DEFINE_RX = /@define\s+([\w.]+)/gm,

    EXT_ALTERNATE_CLASS_NAME_RX = /alternateClassName:\s*\[?\s*((['"]([\w.*]+)['"]\s*,?\s*)+)\s*\]?,?/m,
    ALTERNATE_CLASS_NAME_RX = /@alternateClassName\s+([\w.]+)/gm,

    AT_REQUIRE_RX = /@require\s+([\w.\/\-]+)/,

    DOT_JS_RX = /\.js$/;


var wellKnownExtraDependencies = {
    requires: {
        'Ext.data.Model': [
            'Ext.data.proxy.Ajax'   // The documentation says it's required, but I have no idea how auto-detect this
        ]
    },
    uses: {}
};


/**
 * Creates a Ext JS parser.
 *
 * @param options Example:
 *    {
 *        // Log verbose? Optional, default is false.
 *        verbose: false,
 *
 *        // The logger to use
 *        logger: <logger>,
 *
 *        // Optimize source? (removes some statements like `require`) Optional, default is false.
 *        optimizeSource: false,
 *
 *        // Extra dependencies. Optional.
 *        extraDependencies: {
 *            requires: {
 *                'MyClass': 'MyDependency'
 *            },
 *            uses: {
 *                'MyClass': 'MyDependency'
 *            }
 *        }
 *
 *        // Classes to exclude. Optional.
 *        excludeClasses: ['Ext.*', 'MyApp.some.Class'],
 *
 *        // Files to exclude (excludes also dependencies). Optional.
 *        skipParse: ['app/ux/SkipMe.js']
 *    }
 * @constructor
 */
var Parser = function(options) {

    var logger,
        _currentFilePath,
        _currentDirPath;

    options = readOptions(options);


    function readOptions(opts) {
        var options = opts || {};
        logger = options.logger || defaultLogger;
        return {
            verbose: !!options.verbose,
            optimizeSource: !!options.optimizeSource,
            extraRequires: extend({}, wellKnownExtraDependencies.requires, options.extraDependencies && options.extraDependencies.requires),
            extraUses:     extend({}, wellKnownExtraDependencies.uses,     options.extraDependencies && options.extraDependencies.uses),
            excludeClasses: options.excludeClasses,
            skipParse: options.skipParse
        };
    }

    function parse(src, filePath) {
        var baseName = path.basename(filePath),
            classData, fileInfo;


        _currentFilePath = filePath;
        _currentDirPath = path.dirname(filePath);

        if (shouldParseFile(filePath)) {
            if (options.verbose) {
                logger.write('Parse ' + baseName + '... ');
            }

            classData = getClassData(src);

            if (classData.classNames.length) {
                if (options.verbose) {
                    logger.ok('Done, defined class names: ' + classData.classNames.join(', '));
                }
                fileInfo = new ExtFile({
                    names: classData.classNames,
                    parentName: classData.parentName,
                    aliasNames: classData.aliasNames,
                    requires: classData.requires,
                    uses: classData.uses,
                    src: classData.src,
                    path: filePath
                });
            } else if (classData.requires.length || classData.uses.length) {
                if (options.verbose) {
                    logger.ok('Done, no defined class name. Adding as ' + baseName);
                }
                fileInfo = new ExtFile({
                    names: [baseName],
                    parentName: classData.parentName,
                    aliasNames: classData.aliasNames,
                    requires: classData.requires,
                    uses: classData.uses,
                    src: classData.src,
                    path: filePath
                });
            }
        } else {
            if (options.verbose) {
                logger.writeln('Skip parse ' + baseName);
            }
            fileInfo = new ExtFile({
                names: [baseName],
                requires: [],
                uses: [],
                src: src, // classData is always undefined
                path: filePath
            });
        }

        _currentFilePath = null;

        return fileInfo;
    }

    function getClassData(src) {
        var output = {
                classNames: [],
                parentName: null,
                requires: [],
                uses: [],
                src: src
            }, ast;

        ast = falafel(src, { comment: true }, function (node) {
            switch (node.type) {
                case 'ExpressionStatement':
                    if (isExtMethodCall('define', node)) {
                        parseDefineCall(node, output);
                    } else if (isExtMethodCall('application', node)) {
                        parseApplicationCall(node, output);
                    } else if (isExtMethodCall('require', node)) {
                        parseRequireCall(node, output);
                    } else if (isExtClassManagerMethodCall('addNameAlternateMappings', node)) {
                        parseAlternateMappingsCall(node, output);
                    }
                    break;

                // Comments
                case 'Block':
                case 'Line':
                    parseComment(node, output);
                    break;
            }
        });

        output.src = options.optimizeSource ? ast.toString() : src;

        output.classNames.forEach(function(className) {
            var extraRequires = options.extraRequires[className];
            if (extraRequires) {
                addClassNames(output.requires, extraRequires);
            }

            var extraUses = options.extraUses[className];
            if (extraUses) {
                addClassNames(output.uses, extraUses);
            }
        });

        if (output.parentName) {
            output.requires.push(output.parentName);
        }

        output.classNames = unique(output.classNames);
        output.requires   = unique(output.requires);
        output.uses       = unique(output.uses);

        return output;
    }

    function parseDefineCall(node, output) {
        var m, classDef;

        // Get class name from Ext.define('MyApp.pkg.MyClass')
        output.definedName = getDefinedClassName(node);
        output.classNames.push(output.definedName);

        // Parse `alternateClassName`
        m = EXT_ALTERNATE_CLASS_NAME_RX.exec(node.source());
        if (m && m[1]) {
            addClassNames(output.classNames, m[1].split(','));
        }

        classDef = getClassDef(node, 1);

        parseClassDefBody(classDef, output);
    }

    function parseApplicationCall(node, output) {
        var classDef, p;

        addClassNames(output.requires, 'Ext.app.Application');

        classDef = getClassDef(node, 0);

        p = getObjectProperty(classDef, 'name');
        if (p) {
            output.definedName = getClassName(getPropertyValue(p));
            addClassNames(output.classNames, output.definedName);
        }

        parseClassDefBody(classDef, output);
    }

    function parseRequireCall(node, output) {
        var classNames = getExpressionAsLiteralOrArray(node.expression.arguments[0]);
        if (classNames) {
            addClassNames(output.requires, classNames);
        }
    }

    /** Parses a call to Ext.ClassManager.addNameAlternateMappings */
    function parseAlternateMappingsCall(node, output) {
        var firstArgument = node.expression.arguments[0];

        if (firstArgument && firstArgument.type === 'ObjectExpression') {
            firstArgument.properties.forEach(function(prop) {
                var aliasClassNames = getPropertyValue(prop);  // Could be a string or an array of strings
                if (aliasClassNames && aliasClassNames.length > 0) {
                    var className = prop.key.value;

                    if (! output.aliasNames) {
                        output.aliasNames = {};
                    }

                    if (typeof aliasClassNames === 'string') {
                        aliasClassNames = [ aliasClassNames ];
                    }

                    var existingAliasClassNames = output.aliasNames[className];
                    if (existingAliasClassNames) {
                        aliasClassNames = existingAliasClassNames.concat(aliasClassNames);
                    }

                    output.aliasNames[className] = aliasClassNames;
                }
            });

            if (options.optimizeSource) {
                // Remove `uses` from parsed file
                node.update('/* call to Ext.ClassManager.addNameAlternateMappings removed */');
            }
        }
    }

    function collectPropertyValues(prop) {
        var i = 0,
            el,
            result = [],
            value = prop.value,
            els = value.elements || value.properties;

        for (; i < els.length; i++) {
            el = els[i];
            if (el.type === 'Literal') {
                result.push(el.value);
            } else if (el.type === 'Property' && el.value.type === 'Literal') {
                result.push(el.value.value);
            }
        }

        return result;
    }

    function getClassDef(node, argumentIndex) {
        if (node.expression && node.expression.arguments && node.expression.arguments.length > argumentIndex) {
            var classDefArgument = node.expression.arguments[argumentIndex];

            if (classDefArgument.properties) {
                // This is a normal Ext.define call.
                // Example: Ext.define('MyClassName', { <class def> })
                return classDefArgument;
            } else if (classDefArgument.type == 'CallExpression' && classDefArgument.callee.type == 'FunctionExpression') {
                // This is a Ext.define call using a wrapper function.
                // Example: Ext.define('MyClassName', (function() { var private = 42; return { <class def> } })() )
                // See: Ext.tip.QuickTipManager or Ext.dom.Element
                // -> Try to extract the class definition from the return statement
                var functionBody = classDefArgument.callee.body.body;
                if (functionBody && functionBody.length > 0) {
                    var lastStatement = functionBody[functionBody.length - 1];
                    if (lastStatement.type == 'ReturnStatement' && lastStatement.argument.properties) {
                        return lastStatement.argument;
                    }
                }
            }
        }
    }

    function getObjectProperty(objectNode, name) {
        var i, prop;

        if (objectNode && objectNode.properties) {
            // If an object property (e.g. `requires`) is defined multiple times, want to use the last one, like the
            // browser will do.
            // -> We search the properties backwards, so we find the last one first
            // Real-world example: `Extensible.calendar.view.AbstractCalendar` has two `requires`-properties (so the first one is useless)
            for (i = objectNode.properties.length - 1; i >= 0; i--) {
                prop = objectNode.properties[i];
                if (prop.key.name === name) {
                    return prop;
                }
            }
        }
    }

    function getPropertyValueFromObject(objectNode, name, forceArray) {
        var val = getPropertyValue(getObjectProperty(objectNode, name));

        if (val && forceArray && !Array.isArray(val)) {
            val = [val];
        }

        return val;
    }

    function getPropertyValueFromObjectOrArray(objectOrArray, name, forceArray) {
        if (objectOrArray.type === 'ObjectExpression') {
            return getPropertyValueFromObject(objectOrArray, name, forceArray);
        } else if (objectOrArray.type === 'ArrayExpression') {
            var array = [];
            objectOrArray.elements.forEach(function (element) {
                var value = getPropertyValueFromObject(element, name, false);
                if (value) {
                    array.push(value);
                }
            });
            return array;
        } else {
            logger.warn('Expected object or array with property "' + name + '" in "' + _currentFilePath + '".');
            return [];
        }
    }

    function getPropertyValue(prop) {
        if (prop && prop.value) {
            if (prop.value.type === 'Literal') {
                return prop.value.value;
            } else if (prop.value.type === 'ArrayExpression') {
                return collectPropertyValues(prop);
            }
        }
    }

    function getExpressionAsLiteralOrArray(expression) {
        if (expression.type == 'Literal') {
            return expression.value
        } else if (expression.type === 'ArrayExpression') {
            return expression.elements.map(function (element) {
                return getExpressionAsLiteralOrArray(element);
            });
        }
    }

    function parseClassDefBody(classDef, output) {
        var m,
            p,
            c;

        // Parse `extend` annotation
        m = getPropertyValueFromObject(classDef, 'extend');

        if (m && ( c = getClassName(m) )) {
            output.parentName = c;
        }

        // Parse `mixins` annotation
        p = getObjectProperty(classDef, 'mixins');
        if (p) {
            if (p.value.type === 'ArrayExpression') {
                addClassNames(output.requires, getPropertyValue(p));
            } else if (p.value.type === 'ObjectExpression') {
                addClassNames(output.requires, collectPropertyValues(p));
            }
        }

        // Parse `requires` annotation
        p = getObjectProperty(classDef, 'requires');
        if (p) {
            addClassNames(output.requires, getPropertyValue(p));

            if (options.optimizeSource) {
                // Remove `requires` from parsed file
                p.update('requires: [ /* requires removed */ ]');
            }
        }

        // Parse `uses: [...]` annotation
        p = getObjectProperty(classDef, 'uses');
        if (p) {
            addClassNames(output.uses, getPropertyValue(p));

            if (options.optimizeSource) {
                // Remove `uses` from parsed file
                p.update('uses: [ /* uses removed */ ]');
            }
        }

        // Parse `controllers: [...]` annotation
        m = getPropertyValueFromObject(classDef, 'controllers', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('controller', m, output.definedName));
        }

        // Parse `models: [...]` and `model: '...'` annotations (see Ext.app.Controller)
        m = getPropertyValueFromObject(classDef, 'models', true) || getPropertyValueFromObject(classDef, 'model', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('model', m, output.definedName));
        }

        // Parse `views: [...]` annotation (see Ext.app.Controller)
        m = getPropertyValueFromObject(classDef, 'views', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('view', m, output.definedName));
        }

        // Parse `stores: [...]` annotation (see Ext.app.Controller)
        m = getPropertyValueFromObject(classDef, 'stores', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('store', m, output.definedName));
        }

        // Parse `belongsTo: [...]` annotation (used by models, see Ext.data.association.BelongsTo)
        p = getObjectProperty(classDef, 'belongsTo');
        if (p) {
            addClassNames(output.requires, 'Ext.data.association.BelongsTo');
            addClassNames(output.uses, getPropertyValue(p));
        }

        // Parse `hasMany: [...]` annotation (used by models, see Ext.data.association.HasMany)
        p = getObjectProperty(classDef, 'hasMany');
        if (p) {
            addClassNames(output.requires, 'Ext.data.association.HasMany');
            addClassNames(output.uses, getPropertyValueFromObjectOrArray(p.value, 'model'));
        }
    }

    function isExtMethodCall(methodName, node) {
        // Example: Ext.define(...)

        var expr = node.expression;
        return ( expr && expr.type === 'CallExpression' &&
            expr.callee &&
            expr.callee.object &&
            expr.callee.object.name === 'Ext' &&
            expr.callee.property &&
            expr.callee.property.name === methodName );
    }

    function isExtClassManagerMethodCall(methodName, node) {
        // Example: Ext.ClassManager.addNameAlternateMappings(...)

        var expr = node.expression;
        return ( expr && expr.type === 'CallExpression' &&
        expr.callee &&
        expr.callee.object &&
        expr.callee.object.object &&
        expr.callee.object.object.name === 'Ext' &&
        expr.callee.object.property &&
        expr.callee.object.property.name === 'ClassManager' &&
        expr.callee.property &&
        expr.callee.property.name === methodName );
    }

    function getDefinedClassName(node) {
        var clsNameRaw = node.expression.arguments[0].value;
        if (typeof clsNameRaw === 'string' && clsNameRaw) {
            return getClassName(clsNameRaw);
        } else {
            logger.warn('Cannot determine class name in define call in "' + _currentFilePath + '".');
        }
    }

    function parseComment(node, output) {
        var m;
        if (node.type === 'Line') {
            m = AT_REQUIRE_RX.exec(node.value);
            if (m && m[1]) {
                if (DOT_JS_RX.test(m[1])) {
                    // @require path/to/file.js
                    output.requires.push(path.resolve(_currentDirPath, trim(m[1])));
                } else {
                    // @require Class.Name
                    addClassNames(output.requires, m[1]);
                }
            }

            while (m = DEFINE_RX.exec(node.value)) {
                if (m[1]) {
                    addClassNames(output.classNames, m[1]);
                }
            }
        } else if (node.type === 'Block') {
            while (m = ALTERNATE_CLASS_NAME_RX.exec(node.value)) {
                if (m[1]) {
                    addClassNames(output.classNames, m[1]);
                }
            }
        }
    }

    function addClassNames(target, nms) {
        var names = Array.isArray(nms) ? nms : [nms];

        names.forEach(function (raw) {
            var name = getClassName(raw);
            if (name) {
                target.push(name);
            }
        });
    }

    function getClassName(className) {
        var clsName = trim(className).replace(/'|"/g, '');
        if (isValidClassName(clsName)) {
            return clsName;
        }
    }

    function extrapolateClassNames(basePkgName, baseNms, dependentName) {
        var doti, ns, baseNames, classNames;

        if (!dependentName) {
            logger.warn('Cannot extrapolate class name without namespace, in ' + _currentFilePath);
        }

        doti = dependentName.indexOf('.');
        ns = (doti > -1 ? dependentName.substring(0, doti) : dependentName);

        if (!ns) {
            logger.warn('Cannot extrapolate class name without namespace, in ' + _currentFilePath);
        }

        baseNames = Array.isArray(baseNms) ? baseNms : [baseNms];
        classNames = [];

        baseNames.forEach(function (n) {
            var name = trim(n).replace(/'|"/g, ''),
                clsName;

            if (name) {
                if (name.substring(0, ns.length) === ns) {
                    clsName = getClassName(name);
                } else {
                    clsName = getClassName(ns + '.' + basePkgName + '.' + name);
                }
                if (clsName) {
                    classNames.push(clsName);
                }
            }
        });

        return classNames;
    }

    function shouldParseFile(filePath) {
        if (options.skipParse) {
            return !minimatcher(filePath, options.skipParse, { matchBase: true });
        }
        return true;
    }

    function isValidClassName(className) {
        if (className && options.excludeClasses) {
            return !minimatcher(className, options.excludeClasses);
        }
        return !!className;
    }

    function createDummyExtFile(filePath) {
        return new ExtFile({
            names: [path.basename(filePath)],
            path: filePath
        });
    }

    this.parse = parse;
    this.createDummyExtFile = createDummyExtFile;

};


function minimatcher (data, patterns, opts) {
    var i = 0,
        l = patterns.length;

    for (; i < l; i++) {
        if (minimatch(data, patterns[i], opts)) {
            return true;
        }
    }

    return false;
}

// Example: var newArray = unique(["a", "b", "b"]); // ["a", "b"]
function unique(array) {
    array.sort();

    var i, item, lastItem;

    for (i = array.length - 1; i >= 0; i--) {
        item = array[i];
        if (item == lastItem) {
            array.splice(i, 1);
        } else {
            lastItem = item;
        }
    }

    return array;
}


module.exports = Parser;
