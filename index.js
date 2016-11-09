'use strict';

var fs = require('fs');
var logger = require('./lib/logger');
var Parser = require('./lib/parser');
var resolver = require('./lib/resolver');


function parse(src, filePath, options) {
    var parser = new Parser(options);
    return parser.parse(src, filePath);
}

function parseFile(filePath, options) {
    options = options || {};
    var source = fs.readFileSync(filePath, options.encoding || 'utf8');
    return parse(source, filePath, options);
}

function getClass(filePath) {
    var parser = Parser.init(logger);
    return parser.getClass(filePath);
}

function resolveFiles(options) {
    var fileInfos = resolver.resolve(options);

    var filePaths = fileInfos.map(function(fileInfo) {
        return fileInfo.path;
    });

    return filePaths;
}

module.exports = {
    parse: parse,
    parseFile: parseFile,
    getClass: getClass,
    resolve: resolver.resolve,
    resolveFiles: resolveFiles
};
