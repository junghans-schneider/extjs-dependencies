// Parses Ext JS source code and extracts defined classes and dependencies.
//
// This parser was originally written by Rowan Crawford and Christofer Pak
// for https://github.com/cpak/grunt-extjs-dependencies (commit 775fd22 from 2013-11-15)
//
// Copyright (c) 2013 christoferpak@gmail.com
// Copyright (c) 2016 Junghans und Schneider


'use strict';

var falafel = require('falafel'),
    minimatch = require('minimatch'),
    path = require('path'),
    trim = require('trim'),
    logger = require('./logger');

var DEFINE_RX = /@define\s+([\w.]+)/gm,

    EXT_ALTERNATE_CLASS_NAME_RX = /alternateClassName:\s*\[?\s*((['"]([\w.*]+)['"]\s*,?\s*)+)\s*\]?,?/m,
    ALTERNATE_CLASS_NAME_RX = /@alternateClassName\s+([\w.]+)/gm,

    AT_REQUIRE_RX = /@require\s+([\w.\/\-]+)/,

    DOT_JS_RX = /\.js$/;


function ExtClass(params) {
    this.names = params.names;
    this.parentName = params.parentName;
    this.requires = params.requires || [];
    this.uses = params.uses || [];
    this.src = params.src;
    this.path = params.path;
    this._isClass = true;
}


var Parser = function(options) {

    options = readOptions(options);

    var _currentFilePath,
        _currentDirPath;


    function readOptions(opts) {
        var options = opts || {};
        return {
            excludeClasses: options.excludeClasses,
            skipParse: options.skipParse
        };
    }

    function parse(src, filePath) {
        var baseName = path.basename(filePath),
            classData, cls;


        _currentFilePath = filePath;
        _currentDirPath = path.dirname(filePath);

        if (shouldParseFile(filePath)) {
            logger.verbose.write('Parse ' + baseName + '... ');

            classData = getClassData(src);

            if (classData.classNames.length) {
                logger.verbose.ok('Done, defined class names: ' + classData.classNames.join(', '));
                cls = new ExtClass({
                    names: classData.classNames,
                    parentName: classData.parentName,
                    requires: classData.requires,
                    uses: classData.uses,
                    src: classData.src,
                    path: filePath
                });
            } else if (classData.requires.length || classData.uses.length) {
                logger.verbose.ok('Done, no defined class name. Adding as ' + baseName);
                cls = new ExtClass({
                    names: [baseName],
                    parentName: classData.parentName,
                    requires: classData.requires,
                    uses: classData.uses,
                    src: classData.src,
                    path: filePath
                });
            }
        } else {
            logger.verbose.writeln('Skip parse ' + baseName);
            cls = new ExtClass({
                names: [baseName],
                requires: [],
                uses: [],
                src: src, // classData is always undefined
                path: filePath
            });
        }

        _currentFilePath = null;

        return cls;
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
                    }
                    break;

                // Comments
                case 'Block':
                case 'Line':
                    parseComment(node, output);
                    break;
            }
        });

        output.src = ast.toString();

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
            for (i = 0; i < objectNode.properties.length; i++) {
                prop = objectNode.properties[i];
                if (prop.key.name === name) {
                    return prop;
                }
            }
        }
    }

    function getObjectPropertyValue(objectNode, name, forceArray) {
        var val = getPropertyValue(getObjectProperty(objectNode, name));

        if (val && forceArray && !Array.isArray(val)) {
            val = [val];
        }

        return val;
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
        m = getObjectPropertyValue(classDef, 'extend');

        if (m && ( c = getClassName(m) )) {
            output.parentName = c;
        }

        // Parse `requires` annotation
        p = getObjectProperty(classDef, 'requires');
        if (p) {
            addClassNames(output.requires, getPropertyValue(p));

            // Remove `requires` from parsed file
            p.update('requires: []');
        }

        // Parse `uses: [...]` annotation
        p = getObjectProperty(classDef, 'uses');
        if (p) {
            addClassNames(output.uses, getPropertyValue(p));

            // Remove `uses` from parsed file
            p.update('uses: []');
        }

        // Parse `controllers: [...]` annotation
        m = getObjectPropertyValue(classDef, 'controllers', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('controller', m, output.definedName));
        }

        // Parse `models: [...]` and `model: '...'` annotations
        m = getObjectPropertyValue(classDef, 'models', true) || getObjectPropertyValue(classDef, 'model', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('model', m, output.definedName));
        }

        // Parse `views: [...]` annotation
        m = getObjectPropertyValue(classDef, 'views', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('view', m, output.definedName));
        }

        // Parse `stores: [...]` annotation
        m = getObjectPropertyValue(classDef, 'stores', true);
        if (m) {
            addClassNames(output.uses, extrapolateClassNames('store', m, output.definedName));
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
    }

    function isExtMethodCall(methodName, node) {
        var expr = node.expression;
        return ( expr && expr.type === 'CallExpression' &&
            expr.callee &&
            expr.callee.object &&
            expr.callee.object.name === 'Ext' &&
            expr.callee.property &&
            expr.callee.property.name === methodName );
    }

    function getDefinedClassName(node) {
        var clsNameRaw = node.expression.arguments[0].value;
        if (typeof clsNameRaw === 'string' && clsNameRaw) {
            return getClassName(clsNameRaw);
        } else {
            logger.fail.warn('Cannot determine class name in define call in "' + _currentFilePath + '".');
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
            logger.fail.warn('Cannot extrapolate class name without namespace, in ' + _currentFilePath);
        }

        doti = dependentName.indexOf('.');
        ns = (doti > -1 ? dependentName.substring(0, doti) : dependentName);

        if (!ns) {
            logger.fail.warn('Cannot extrapolate class name without namespace, in ' + _currentFilePath);
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

    function getClass(filePath) {
        return new ExtClass({
            names: [path.basename(filePath)],
            path: filePath
        });
    }

    this.parse = parse;
    this.getClass = getClass;

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
    var uniqueArray = [],
        entryMap = {},
        arrayLength = array.length,
        i, item;

    for (i = 0; i < arrayLength; i++) {
        item = array[i];
        if (! entryMap[item]) {
            uniqueArray.push(item);
            entryMap[item] = true;
        }
    }

    return uniqueArray;
}


module.exports = Parser;
