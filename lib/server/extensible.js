"use strict";
var logger = new (require('../logging.js'))('Extension');
class Extensible {
    addExtension(extension) {
        this._extensions = this._extensions || [];
        this._extensions.push(extension);
        if (extension.added) extension.added(this);
    }

    removeExtension(extension) {
        if (!this._extensions) return;
        var i = this._extensions.length;
        while (i--) {
            if (this._extensions[i] !== extension) continue;
            this._extensions.splice(i, 1);
            if (extension.removed) extension.removed(this);
        }
    }

    pipeThroughExtensions(stage, message, request, callback, context) {
        logger.debug('Passing through %s extensions: %s', stage, JSON.stringify(message));

        if (!this._extensions) return callback.call(context, message);
        var extensions = this._extensions.slice();

        var pipe = function (message) {
            if (!message) return callback.call(context, message);

            var extension = extensions.shift();
            if (!extension) return callback.call(context, message);

            var fn = extension[stage];
            if (!fn) return pipe(message);

            if (fn.length >= 3) extension[stage](message, request, pipe);
            else                extension[stage](message, pipe);
        };
        pipe(message);
    }
}

module.exports = Extensible;