"use strict";

class Timeouts {
    addTimeout(name, delay, callback, context) {
        this._timeouts = this._timeouts || {};
        if (this._timeouts.hasOwnProperty(name)) return;
        var self = this;
        this._timeouts[name] = setTimeout(function () {
            delete self._timeouts[name];
            callback.call(context);
        }, 1000 * delay);
    }

    removeTimeout(name) {
        this._timeouts = this._timeouts || {};
        var timeout = this._timeouts[name];
        if (!timeout) return;
        clearTimeout(timeout);
        delete this._timeouts[name];
    }

    removeAllTimeouts() {
        this._timeouts = this._timeouts || {};
        for (var name in this._timeouts) this.removeTimeout(name);
    }
}

module.exports = Timeouts;