"use strict";

class Namespace {
    constructor() {
        this._used = {};
    }

    exists(id) {
        return this._used.hasOwnProperty(id);
    }

    generate() {
        var name = require('uuid').v1();
        while (this._used.hasOwnProperty(name))
            name = require('uuid').v1();
        return this._used[name] = name;
        //return name;
    }

    release(id) {
        delete this._used[id];
    }
}

module.exports = Namespace;