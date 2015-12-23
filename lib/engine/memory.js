"use strict";
var uuid = require('uuid');
var Timeouts = require('../timeouts.js');
var Namespace = require('../namespace.js');
class Memory extends Timeouts {
    constructor(server, options) {
        super();
        this._server = server;
        this._options = options || {};
        this.reset();
    }

    disconnect() {
        this.reset();
        this.removeAllTimeouts();
    }

    reset() {
        this._namespace = new Namespace();
        this._clients = {};
        this._channels = {};
        this._messages = {};
    }

    createClient(callback, context) {
        var clientId = this._namespace.generate();
        console.log('Created new client %s', clientId);
        this.ping(clientId);
        this._server.emit('handshake', clientId);
        callback.call(context, clientId);
    }

    destroyClient(clientId, callback, context) {
        if (!this._namespace.exists(clientId)) return;
        var clients = this._clients;

        var self = this;
        if (clients[clientId])
            for (let channel of clients[clientId]) {
                self.unsubscribe(clientId, channel)
            }

        this.removeTimeout(clientId);
        this._namespace.release(clientId);
        delete this._messages[clientId];
        console.log('Destroyed client %s', clientId);
        this._server.emit('disconnect', clientId);
        this._server.emit('close', clientId);
        if (callback) callback.call(context);
    }

    clientExists(clientId, callback, context) {
        callback.call(context, this._namespace.exists(clientId));
    }

    ping(clientId) {
        var timeout = this._server.timeout;
        if (typeof timeout !== 'number') return;

        console.log('Ping %s, %s', clientId, timeout);
        this.removeTimeout(clientId);
        this.addTimeout(clientId, 2 * timeout, function () {
            this.destroyClient(clientId);
        }, this);
    }

    subscribe(clientId, channel, callback, context) {
        var clients = this._clients, channels = this._channels;

        clients[clientId] = clients[clientId] || new Set();
        var trigger = clients[clientId].add(channel);

        channels[channel] = channels[channel] || new Set();
        channels[channel].add(clientId);

        console.log('Subscribed client %s to channel %s', clientId, channel);
        if (trigger) this._server.emit('subscribe', clientId, channel);
        if (callback) callback.call(context, true);
    }

    unsubscribe(clientId, channel, callback, context) {
        var clients = this._clients,
            channels = this._channels,
            trigger = false;

        if (clients[clientId]) {
            trigger = clients[clientId].delete(channel);
            if (clients[clientId].size === 0) delete clients[clientId];
        }

        if (channels[channel]) {
            channels[channel].delete(clientId);
            if (channels[channel].size === 0) delete channels[channel];
        }

        console.log('Unsubscribed client %s from channel %s', clientId, channel);
        if (trigger) this._server.emit('unsubscribe', clientId, channel);
        if (callback) callback.call(context, true);
    }

    publish(message, channels) {
        console.log('Publishing message %s', JSON.stringify(message));

        var messages = this._messages,
            clients = new Set(),
            subs;

        for (var i = 0, n = channels.length; i < n; i++) {
            subs = this._channels[channels[i]];
            if (!subs) continue;
            for (let k of subs) {
                clients.add(k);
            }
        }

        var self = this;
        for (let clientId of clients) {
            console.log('Queueing for client %s: %s', clientId, message);
            messages[clientId] = messages[clientId] || [];
            messages[clientId].push(Object.assign({}, message));
            self.emptyQueue(clientId);

        }

        this._server.emit('publish', message.clientId, message.channel, message.data);
    }

    emptyQueue(clientId) {
        if (!this._server.hasConnection(clientId)) return;
        this._server.deliver(clientId, this._messages[clientId]);
        delete this._messages[clientId];
    }
}

module.exports = Memory;