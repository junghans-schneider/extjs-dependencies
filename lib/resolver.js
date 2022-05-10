// Resolves and sorts all dependencies of an Ext JS project.
//
// Copyright (c) 2016 Junghans und Schneider

'use strict';

var fs = require('fs');
var path = require('path');
var process = require('process');
var extend = require('util')._extend;
var Parser = require('./parser');
var logger = require('./logger');


var defaultFileProvider = {

    /**
     * Returns an object representing the content of a file.
     *
     * @param rootPath {string} the root path of the project
     * @param filePath {string} the path of the file (relative to rootPath)
     * @param encoding {string?} the encoding to use (is null if a default should be used)
     * @return {object} an object representing the content.
     */
    createFileContent: function(rootPath, filePath, encoding) {
        return fs.readFileSync(path.resolve(rootPath, filePath), encoding || 'utf8');
    },

    /**
     * Returns the content of a file as string.
     *
     * @param content {object} the object representing the file content
     * @returns {string} the content
     */
    getContentAsString: function(content) {
        return content;
    }

};


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
 *            // The source folders for each class name prefix. Optional.
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
 *        skipParse: ['app/ux/SkipMe.js'],
 *
 *        // The file provider to use. Optional.
 *        fileProvider: {
 *            // Returns an object representing the content of a file.
 *            createFileContent: function(rootPath, filePath, encoding) { ... },
 *
 *            // Returns the content of a file as string.
 *            getContentAsString: function(content) { ... }
 *        }
 *    }
 * @return The dependencies as array of ExtClass in correct loading order
 */
function resolve(options) {
    options = extend({
        root: '.',
        fileProvider: defaultFileProvider
    }, options);

    var context = {
        options: options,
        parser: new Parser({
            excludeClasses: options.excludeClasses,
            skipParse: options.skipParse,
            extraDependencies: options.extraDependencies,
            parserOptions: options.parserOptions,
            optimizeSource: options.optimizeSource
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
    var options = context.options;

    var content = options.fileProvider.createFileContent(options.root, filePath, options.encoding);
    var contentAsString = options.fileProvider.getContentAsString(content);
    var extFile;
    try {
        extFile = context.parser.parse(contentAsString, filePath);
    } catch (e) {
        throw new Error("Error parsing "+filePath+" :\n"+e);
    }

    return {
        path:    filePath,
        content: content,
        extFile: extFile
    };
}


function markProvided(filePath, context) {
    var fileInfo = parseFile(filePath, context);
    var extFile = fileInfo.extFile;
    if (! extFile) {
        logger.warn('File is no Ext JS source: ' + filePath);
    } else {
        addAliasNames(extFile, context);
        addResolvePaths(extFile, context);

        extFile.names.forEach(function (className) {
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
    var extFile = fileInfo.extFile;
    if (! extFile) {
        logger.warn('File is no Ext JS source: ' + filePath);
        fileInfo.extFile = context.parser.createDummyExtFile(filePath);
        context.fileInfoByPath[filePath] = fileInfo;
    } else {
        extFile.names.forEach(function(className) {
            context.fileInfoByClassName[className] = fileInfo;
        });

        addAliasNames(extFile, context);
        addResolvePaths(extFile, context);

        context.fileInfoByPath[filePath] = fileInfo;
        extFile.requires.forEach(function(className) {
            resolveDependency(className, filePath, context);
        });
        extFile.uses.forEach(function(className) {
            resolveDependency(className, filePath, context);
        });
    }

    // We first add our fileInfo after our dependencies
    // -> context.fileInfos will be roughly pre-sorted
    context.fileInfos.push(fileInfo);
}


function addAliasNames(extFile, context) {
    var aliasNames = extFile.aliasNames;
    if (aliasNames) {
        for (var className in aliasNames) {
            var aliasClassNames = aliasNames[className];

            aliasClassNames.forEach(function(aliasClassName) {
                context.classNameByAlias[aliasClassName] = className;
            });
        }
    }
}


function addResolvePaths(extFile, context) {
    var resolvePaths = extFile.resolvePaths;
    if (resolvePaths) {
        var resolveOptions = context.options.resolve;
        if (!resolveOptions) {
            resolveOptions = context.options.resolve = {};
        }
        for (var classPrefix in resolvePaths) {
            var path = resolvePaths[classPrefix];

            if (context.options.verbose) {
                logger.ok('Detected resolve path for ' + classPrefix + ' classes: ' + path);
            }

            if (! resolveOptions.path) {
                resolveOptions.path = {};
            }
            if (! resolveOptions.path[classPrefix]) {
                resolveOptions.path[classPrefix] = path;
            }
        }
    }
}

function findFilePathCandidates(className, resolvePaths, isClass) {
    var filePaths = [];
    for (var classPrefix in resolvePaths) {
        if (className.startsWith(classPrefix)) {
            var pathPrefixes = toArray(resolvePaths[classPrefix]);
            filePaths = filePaths.concat(pathPrefixes.map(function (pathPrefix) {
                var filePath = null;
                if (className.charAt(classPrefix.length) === '.') {
                    // Example:
                    //   className         'Ext.button.Button'
                    //   with resolve-rule `Ext: 'extjs/src'`
                    //   resolves to       'extjs/src/button/Button.js'

                    filePath = pathPrefix + '/' + className.substring(classPrefix.length + 1).replace(/\./g, '/');
                    if (isClass) filePath += '.js';
                } else if (className.length === classPrefix.length && classPrefix.indexOf('.') === -1) {
                    // Example:
                    //   className         `Ext`
                    //   with resolve-rule `Ext: 'extjs/src'`
                    //   resolves to       'extjs/src/Ext.js'
                    filePath = pathPrefix + '/' + classPrefix + '.js';
                    if (isClass) filePath += '.js';
                } else if (className === classPrefix && (!isClass || pathPrefix.endsWith('.js'))) {
                    // Example:
                    //   className         `Ext.button.Button`
                    //   with resolve-rule `"Ext.button.Button": 'extjs/src/button/Button.js'`
                    //   resolves to       'extjs/src/button/Button.js'
                    filePath = pathPrefix;
                }

                return filePath;
            })).filter(function (item, pos, self) {
                return item && self.indexOf(item) == pos;
            });
        }
    }
    return filePaths;
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

    var resolveOptions = context.options.resolve;
    if (className.endsWith('*')) {
        // Case: requires:[ 'Ext.util.*' ]
       className = className.substring( 0,className.length-2);
       findFilePathCandidates(className, resolveOptions.path, false)
           .forEach(candidatePath=> {
                if(!fs.existsSync(candidatePath)) {
                    return;
                }
                var files = [];
                if(fs.lstatSync(candidatePath).isFile()){
                    files.push(candidatePath);
                }else {
                    files = fs.readdirSync(candidatePath).map(file=>candidatePath+'/'+file);
                }
                files.forEach(
                    file => collectDependencies( file, context)
                );
           })
        return;
    }

    if (context.options.verbose) {
        logger.write('Resolve ' + className + '... ');
    }


    var classNameFromOptions = resolveOptions.alias && resolveOptions.alias[className];
    className = classNameFromOptions || context.classNameByAlias[className] || className;

    var filePaths = findFilePathCandidates(className, resolveOptions.path, true);
    if (filePaths.length===0) {
        logger.warn('No resolve rule for "' + className + "' (found in " + sourceFilePath + ')');
    } else {

        var fullFilePaths = filePaths.map(function(filePath){
            return filePath?path.resolve(context.options.root, filePath):null;
        }).filter(function(filePath){
            return fs.existsSync(filePath);
        });

        if (fullFilePaths.length>0 ) {
            if (context.options.verbose) {
                logger.ok('Done: ' + filePath);
            }
            collectDependencies(fullFilePaths[0], context)
        }else {
            logger.warn('Couldn\'t find class file for "' + className + '": ' + filePaths + ' (found in ' + sourceFilePath + ') - Maybe you should define an alias');
        }
    }
}


function orderFileInfo(context) {
    var resolvedFileInfos = [],  // Contains fileInfos
        unresolvedItems = [],    // Contains maps: { unresolved: [ 'path1', 'path2' ], fileInfo: <fileInfo> }
        unresolvedPaths = {};    // Contains true for every path which is still unresolved

    context.fileInfos.forEach(function(fileInfo) {
        var extFile = fileInfo.extFile;
        var filePath = fileInfo.path;

        if (extFile.path != filePath) {
            throw new Error('Expected extFile.path == filePath, but ' + extFile.path + ' != ' + filePath);
        }

        var unresolved = [];
        extFile.requires.forEach(function(className) {
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
