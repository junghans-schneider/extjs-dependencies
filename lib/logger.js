
// Real source see: https://github.com/gruntjs/grunt-legacy-log/blob/master/index.js
var logVerbose = false;

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

function emptyFn() {}


exports.ttyColors = ttyColors;
exports.verbose = {
    write:   logVerbose ? write   : emptyFn,
    writeln: logVerbose ? writeln : emptyFn,
    ok:      logVerbose ? ok      : emptyFn,
    warn:    logVerbose ? warn    : emptyFn
};
exports.fail = {
    write:   write,
    writeln: writeln,
    ok:      ok,
    warn:    warn
};
