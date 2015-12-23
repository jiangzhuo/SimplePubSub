"use strict";
var EventEmitter = require('events');
var Grammar = require('./grammar.js');
class Channel extends EventEmitter {
    constructor(name) {
        this.id = this.name = name;
    }


    static get HANDSHAKE() {
        return '/meta/handshake';
    }

    static get CONNECT() {
        return '/meta/connect';
    }

    static get SUBSCRIBE() {
        return '/meta/subscribe';
    }

    static get UNSUBSCRIBE() {
        return '/meta/unsubscribe';
    }

    static get DISCONNECT() {
        return '/meta/disconnect';
    }

    static get META() {
        return 'meta';
    }

    static get SERVICE() {
        return 'service';
    }

    push(message) {
        this.emit('message', message);
    }

    isUnused() {
        return this.countListeners('message') === 0;
    }

    static expand(name) {
        var segments = this.parse(name),
            channels = ['/**', name];

        var copy = segments.slice();
        copy[copy.length - 1] = '*';
        channels.push(this.unparse(copy));

        for (var i = 1, n = segments.length; i < n; i++) {
            copy = segments.slice(0, i);
            copy.push('**');
            channels.push(this.unparse(copy));
        }

        return channels;
    }

    static isValid(name) {
        return Grammar.CHANNEL_NAME.test(name) ||
            Grammar.CHANNEL_PATTERN.test(name);
    }

    static parse(name) {
        if (!this.isValid(name)) return null;
        return name.split('/').slice(1);
    }

    static unparse(segments) {
        return '/' + segments.join('/');
    }

    static isMeta(name) {
        var segments = this.parse(name);
        return segments ? (segments[0] === this.META) : null;
    }

    static isService(name) {
        var segments = this.parse(name);
        return segments ? (segments[0] === this.SERVICE) : null;
    }

    static isSubscribable(name) {
        if (!this.isValid(name)) return null;
        return !this.isMeta(name) && !this.isService(name);
    }
}


module.exports = Channel;