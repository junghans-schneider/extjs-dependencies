// A simple logger.
//
// Produces a similar output as grunt-legacy-log
//
// Copyright (c) 2016 Junghans und Schneider

'use strict';

var ttyColors = {
    neutral: '\x1B[39m',
    red:     '\x1B[31m',
    green:   '\x1B[32m',
    yellow:  '\x1B[33m',
    blue:    '\x1B[34m',
    magenta: '\x1B[35m',
    cyan:    '\x1B[36m',
    white:   '\x1B[37m',
    gray:    '\x1B[90m'
};


function write(message) {
    process.stdout.write(message);
}

function writeln(message) {
    console.log(message);
}

function ok(message) {
    console.log(ttyColors.green + '>> ' + ttyColors.neutral + message);
}

function warn(message) {
    console.log(ttyColors.red + '>> ' + ttyColors.neutral + message);
}


module.exports = {
    ttyColors: ttyColors,
    write:     write,
    writeln:   writeln,
    ok:        ok,
    warn:      warn
};
