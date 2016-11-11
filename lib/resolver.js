// Resolves and sorts all dependencies of an Ext JS project.
//
// Copyright (c) 2016 Junghans und Schneider

'use strict';

var fs = require('fs'),
    path = require('path'),
    process = require('process'),
    Parser = require('./parser'),
    logger = require('./logger');


/**
 * Resolves and sorts all dependencies of an Ext JS project.
 *
 * @param options Example:
 *    {
 *        // Log verbose? Optional, default is false.
 *        verbose: false,
 *
 *        // Source file encoding. Default: 'utf8'
 *        encoding: 'utf8',
 *
 *        // The root of your project. All paths are relative to this. Default: '.'
 *        root: 'path/to/project',
 *
 *        // Add Ext JS scripts you load independently in your html file.
 *        provided: [ 'extjs/ext-dev.js' ],
 *
 *        // Add all entry points to include with dependencies
 *        entry: [ 'app.js' ],
 *
 *        resolve: {
 *            // The source folders for each class name prefix
 *            path: {
 *                'Ext':   'ext/src',
 *                'myapp': 'app'
 *            },
 *
 *            // Alternative class names. Optional.
 *            alias: {
 *                'Ext.Layer': 'Ext.dom.Layer'
 *            }
 *        },
 *
 *        // Optimize source? (removes some statements like `require`) Optional. Default is false.
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
 * @return The dependencies as array of ExtClass in correct loading order
 */
function resolve(options) {
    options.root = options.root || '.';

    var context = {
        options: options,
        parser: new Parser({
            excludeClasses: options.excludeClasses,
            skipParse: options.skipParse,
            extraDependencies: options.extraDependencies
        }),
        classNameByAlias: {},             // maps alias className (String) to its real className (String)
        providedFileInfoByClassName: {},  // maps className (String) to fileInfo (ExtClass) for provided files
        fileInfoByPath: {},               // maps filePath (String) to fileInfo (ExtClass)  for files to include
        fileInfoByClassName: {},          // maps className (String) to fileInfo (ExtClass) for files to include
        fileInfos: []
    };

    var providedOption = options.provided;
    if (providedOption) {
        toArray(providedOption).forEach(function(path) {
            markProvided(path, context)
        });
    }

    toArray(options.entry).forEach(function(path) {
        collectDependencies(path, context)
    });

    return orderFileInfo(context);
}


function toArray(stringOrArray) {
    if (typeof stringOrArray == 'string') {
        return [ stringOrArray ];
    } else {
        return stringOrArray;
    }
}

function parseFile(filePath, context) {
    var source = fs.readFileSync(path.resolve(context.options.root, filePath), context.options.encoding || 'utf8');
    return context.parser.parse(source, filePath);
}


function markProvided(filePath, context) {
    var fileInfo = parseFile(filePath, context);
    if (! fileInfo) {
        logger.warn('File is no Ext JS source: ' + filePath);
    } else {
        addAliasNames(fileInfo, context);
        addResolvePaths(fileInfo, context);

        fileInfo.names.forEach(function (className) {
            context.providedFileInfoByClassName[className] = fileInfo;
        });
    }
}


function collectDependencies(filePath, context) {
    if (context.fileInfoByPath[filePath]) {
        // Already processed
        return;
    }

    var fileInfo = parseFile(filePath, context);
    if (! fileInfo) {
        logger.warn('File is no Ext JS source: ' + filePath);
        fileInfo = context.parser.createDummyExtFile(filePath);
        context.fileInfoByPath[filePath] = fileInfo;
    } else {
        fileInfo.names.forEach(function(className) {
            context.fileInfoByClassName[className] = fileInfo;
        });

        addAliasNames(fileInfo, context);
        addResolvePaths(fileInfo, context);

        context.fileInfoByPath[filePath] = fileInfo;
        fileInfo.requires.forEach(function(className) {
            resolveDependency(className, filePath, context);
        });
        fileInfo.uses.forEach(function(className) {
            resolveDependency(className, filePath, context);
        });
    }

    // We first add our dependencies
    // -> fileInfo will be roughly pre-sorted
    context.fileInfos.push(fileInfo);
}


function addAliasNames(fileInfo, context) {
    var aliasNames = fileInfo.aliasNames;
    if (aliasNames) {
        for (var className in aliasNames) {
            var aliasClassNames = aliasNames[className];

            aliasClassNames.forEach(function(aliasClassName) {
                context.classNameByAlias[aliasClassName] = className;
            });
        }
    }
}


function addResolvePaths(fileInfo, context) {
    var resolvePaths = fileInfo.resolvePaths;
    if (resolvePaths) {
        var resolveOptions = context.options.resolve;
        for (var classPrefix in resolvePaths) {
            var path = resolvePaths[classPrefix];

            if (! resolveOptions.path) {
                resolveOptions.path = {};
            }
            if (! resolveOptions.path[classPrefix]) {
                resolveOptions.path[classPrefix] = path;
            }
        }
    }
}


function resolveDependency(className, sourceFilePath, context) {
    if (context.providedFileInfoByClassName[className] || context.fileInfoByClassName[className]) {
        // Already resolved
        return;
    }

    if (className.startsWith('/')) {
        if (context.options.verbose) {
            logger.writeln('Ignoring file dependency ' + className + ' (found in ' + sourceFilePath + ')');
        }
        return;
    }

    if (context.options.verbose) {
        logger.write('Resolve ' + className + '... ');
    }

    var resolveOptions = context.options.resolve;
    var classNameFromOptions = resolveOptions.alias && resolveOptions.alias[className];
    className = classNameFromOptions || context.classNameByAlias[className] || className;

    var filePath = null;
    for (var classPrefix in resolveOptions.path) {
        if (className.startsWith(classPrefix)) {
            var pathPrefix = resolveOptions.path[classPrefix];
            if (className.charAt(classPrefix.length) == '.') {
                // Example:
                //   className         'Ext.button.Button'
                //   with resolve-rule `Ext: 'extjs/src'`
                //   resolves to       'extjs/src/button/Button.js'
                filePath = pathPrefix + '/' + className.substring(classPrefix.length + 1).replace(/\./g, '/') + '.js'
            } else if (className.length == classPrefix.length && classPrefix.indexOf('.') == -1) {
                // Example:
                //   className         `Ext`
                //   with resolve-rule `Ext: 'extjs/src'`
                //   resolves to       'extjs/src/Ext.js'
                filePath = pathPrefix + '/' + classPrefix + '.js'
            }
        }
    }

    if (filePath == null) {
        logger.warn('No resolve rule for "' + className + "' (found in " + sourceFilePath + ')');
    } else if (!fs.existsSync(path.resolve(context.options.root, filePath))) {
        logger.warn('Couldn\'t find class file for "' + className + "' (found in " + sourceFilePath + ') - Maybe you should define an alias');
    } else {
        if (context.options.verbose) {
            logger.ok('Done: ' + filePath);
        }
        collectDependencies(filePath, context)
    }
}


function orderFileInfo(context) {
    var resolvedFileInfos = [],  // Contains fileInfos
        unresolvedItems = [],    // Contains maps: { unresolved: [ 'path1', 'path2' ], fileInfo: <fileInfo> }
        unresolvedPaths = {};    // Contains true for every path which is still unresolved

    context.fileInfos.forEach(function(fileInfo) {
        var filePath = fileInfo.path;

        if (fileInfo.path != filePath) {
            throw new Error('Expected fileInfo.path == filePath, but ' + fileInfo.path + ' != ' + filePath);
        }

        var unresolved = [];
        fileInfo.requires.forEach(function(className) {
            var requiredFileInfo = context.fileInfoByClassName[className];
            if (requiredFileInfo) {
                unresolved.push(requiredFileInfo.path);
            }
        });

        unresolvedItems.push({
            fileInfo: fileInfo,
            unresolved: unresolved
        });
        unresolvedPaths[filePath] = true;
    });

    while (unresolvedItems.length > 0) {
        if (context.options.verbose) {
            logger.writeln('Resolving loop - ' + unresolvedItems.length + ' files left');
        }

        var didResolve = false;

        for (var itemIndex = 0; itemIndex < unresolvedItems.length; itemIndex++) {
            var item = unresolvedItems[itemIndex];

            for (var i = item.unresolved.length - 1; i >= 0; i--) {
                var requiredFilePath = item.unresolved[i];
                if (! unresolvedPaths[requiredFilePath]) {
                    // This dependency was resolved -> Remove it
                    item.unresolved.splice(i, 1);
                }
            }

            if (item.unresolved.length == 0) {
                // This item is resolved
                resolvedFileInfos.push(item.fileInfo);
                unresolvedItems.splice(itemIndex, 1);
                unresolvedPaths[item.fileInfo.path] = false;
                didResolve = true;

                itemIndex--; // Check this index again
            }
        }

        if (!didResolve) {
            var circularFilePaths = unresolvedItems.map(function(item) {
                return item.fileInfo.path
            });
            throw new Error('Circular dependency among ' + JSON.stringify(circularFilePaths));
        }
    }

    return resolvedFileInfos;
}


exports.resolve = resolve;
