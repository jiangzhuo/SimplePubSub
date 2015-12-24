"use strict";
var SimplePubSub = require('./index.js');
var util = require('util');
class Logging {

    static get LOG_LEVELS() {
        return {
            fatal: 4,
            error: 3,
            warn: 2,
            info: 1,
            debug: 0
        }
    }

    constructor(name) {
        this.name = name;
        var self = this;
        for (var key in Logging.LOG_LEVELS)
            (function (level) {
                self[level] = function () {
                    this.writeLog(arguments, level);
                };
            })(key);
    }

    writeLog(messageArgs, level) {
        if (!SimplePubSub.logger) return;

        var banner = '[SimplePubSub',
            message = util.format(...messageArgs);
        banner += '.' + this.name + ']';

        if (typeof SimplePubSub.logger[level] === 'function')
            SimplePubSub.logger[level](banner + message);
        else if (typeof SimplePubSub.logger === 'function')
            SimplePubSub.logger(banner + message);
    }
}
module.exports = Logging;