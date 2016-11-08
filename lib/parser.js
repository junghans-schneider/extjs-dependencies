
'use strict';

function ExtClass(params) {
    this.names = params.names;
    this.parentName = params.parentName;
    this.dependencies = params.dependencies || [];
    this.src = params.src;
    this.path = params.path;
    this._isClass = true;
}

exports.init = function (grunt, opts) {
    var options,
        array = require('array-extended'),
        falafel = require('falafel'),
        minimatcher = require('./minimatcher'),
        path = require('path'),
        trim = require('trim'),


        DEFINE_RX = /@define\s+([\w.]+)/gm,

        EXT_ALTERNATE_CLASS_NAME_RX = /alternateClassName:\s*\[?\s*((['"]([\w.*]+)['"]\s*,?\s*)+)\s*\]?,?/m,
        ALTERNATE_CLASS_NAME_RX = /@alternateClassName\s+([\w.]+)/gm,

        AT_REQUIRE_RX = /@require\s+([\w.\/\-]+)/,

        DOT_JS_RX = /\.js$/,

        _currentFilePath,
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
            grunt.verbose.write('Parse ' + baseName + '... ');

            classData = getClassData(src);

            if (classData.classNames.length) {
                grunt.verbose.ok('Done, defined class names: ' + classData.classNames.join(', '));
                cls = new ExtClass({
                    names: classData.classNames,
                    parentName: classData.parentName,
                    dependencies: classData.dependencies,
                    src: classData.src,
                    path: filePath
                });
            } else if (classData.dependencies && classData.dependencies.length) {
                grunt.verbose.ok('Done, no defined class name. Adding as ' + baseName);
                cls = new ExtClass({
                    names: [baseName],
                    parentName: classData.parentName,
                    dependencies: classData.dependencies,
                    src: classData.src,
                    path: filePath
                });
            }
        } else {
            grunt.verbose.writeln('Skip parse ' + baseName);
            cls = new ExtClass({
                names: [baseName],
                dependencies: [],
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
                dependencies: [],
                src: src
            }, ast;

        ast = falafel(src, { comment: true }, function (node) {
            switch (node.type) {
                case 'ExpressionStatement':
                    if (isExtMethodCall('define', node)) {
                        parseDefineCall(node, output);
                    } else if (isExtMethodCall('application', node)) {
                        parseApplicationCall(node, output);
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
            output.dependencies.push(output.parentName);
        }

        output.classNames = array.unique(output.classNames);
        output.dependencies = array.unique(output.dependencies);

        return output;
    }

    function parseDefineCall(node, output) {
        var m;
        // Get class name from Ext.define('MyApp.pkg.MyClass')
        output.definedName = getDefinedClassName(node);
        output.classNames.push(output.definedName);

        // Parse `alternateClassName`
        m = EXT_ALTERNATE_CLASS_NAME_RX.exec(node.source());
        if (m && m[1]) {
            addClassNames(output.classNames, m[1].split(','));
        }

        parseClassDefBody(node, output);
    }

    function parseApplicationCall(node, output) {
        var p;

        p = getClassDefProperty(node, 'name');
        if (p) {
            output.definedName = getClassName(getPropertyValue(p));
            addClassNames(output.classNames, output.definedName);
        }

        parseClassDefBody(node, output);
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

    function getClassDefProperty(node, name) {
        var arg,
            obj,
            i,
            prop;

        if (node.expression && node.expression.arguments) {
            for (i = 0; i < node.expression.arguments.length; i++) {
                arg = node.expression.arguments[i];
                if (arg.properties) {
                    obj = arg;
                    break;
                }
            }
        }

        if (obj) {
            for (i = 0; i < obj.properties.length; i++) {
                prop = obj.properties[i];
                if (prop.key.name === name) {
                    return prop;
                }
            }
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

    function getClassDefValue(node, name, forceArray) {
        var val = getPropertyValue(getClassDefProperty(node, name));

        if (val && forceArray && !Array.isArray(val)) {
            val = [val];
        }

        return val;
    }

    function parseClassDefBody(node, output) {
        var nodeSrc = node.source(),
            m,
            p,
            c;
        // Parse `extend` annotation
        m = getClassDefValue(node, 'extend');

        if (m && ( c = getClassName(m) )) {
            output.parentName = c;
        }

        // Parse `requires` annotation
        p = getClassDefProperty(node, 'requires');
        if (p) {
            addClassNames(output.dependencies, getPropertyValue(p));

            // Remove `requires` from parsed file
            p.update('requires: []');
        }

        // Parse `uses: [...]` annotation
        p = getClassDefProperty(node, 'uses');
        if (p) {
            addClassNames(output.dependencies, getPropertyValue(p));

            // Remove `uses` from parsed file
            p.update('uses: []');
        }

        // Parse `controllers: [...]` annotation
        m = getClassDefValue(node, 'controllers', true);
        if (m) {
            addClassNames(output.dependencies, extrapolateClassNames('controller', m, output.definedName));
        }

        // Parse `models: [...]` and `model: '...'` annotations
        m = getClassDefValue(node, 'models', true) || getClassDefValue(node, 'model', true);
        if (m) {
            addClassNames(output.dependencies, extrapolateClassNames('model', m, output.definedName));
        }

        // Parse `views: [...]` annotation
        m = getClassDefValue(node, 'views', true);
        if (m) {
            addClassNames(output.dependencies, extrapolateClassNames('view', m, output.definedName));
        }

        // Parse `stores: [...]` annotation
        m = getClassDefValue(node, 'stores', true);
        if (m) {
            addClassNames(output.dependencies, extrapolateClassNames('store', m, output.definedName));
        }

        // Parse `mixins` annotation
        p = getClassDefProperty(node, 'mixins');
        if (p) {
            if (p.value.type === 'ArrayExpression') {
                addClassNames(output.dependencies, getPropertyValue(p));
            } else if (p.value.type === 'ObjectExpression') {
                addClassNames(output.dependencies, collectPropertyValues(p));
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
            grunt.fail.warn('Cannot determine class name in define call in "' + _currentFilePath + '".');
        }
    }

    function parseComment(node, output) {
        var m;
        if (node.type === 'Line') {
            m = AT_REQUIRE_RX.exec(node.value);
            if (m && m[1]) {
                if (DOT_JS_RX.test(m[1])) {
                    // @require path/to/file.js
                    output.dependencies.push(path.resolve(_currentDirPath, trim(m[1])));
                } else {
                    // @require Class.Name
                    addClassNames(output.dependencies, m[1]);
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
            grunt.fail.warn('Cannot extrapolate class name without namespace, in ' + _currentFilePath);
        }

        doti = dependentName.indexOf('.');
        ns = (doti > -1 ? dependentName.substring(0, doti) : dependentName);

        if (!ns) {
            grunt.fail.warn('Cannot extrapolate class name without namespace, in ' + _currentFilePath);
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

    options = readOptions(opts);

    exports.parse = parse;
    exports.getClass = getClass;

    return exports;
};
