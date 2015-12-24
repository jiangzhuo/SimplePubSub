"use strict";
var Extensible = require('./extensible.js');
var Engine = require('../engine/engine.js');
var Channel = require('../channel.js');
var Grammar = require('../grammar.js');
var Error = require('../error.js');
var Socket = require('./socket.js');
var SimplePubSub = require('../index.js');
var logger = new SimplePubSub.Logging('Server');
class Server extends Extensible {
    get META_METHODS() {
        return ['handshake', 'connect', 'disconnect', 'subscribe', 'unsubscribe'];
    }

    constructor(options) {
        super();
        this._options = options || {};
        var engineOpts = this._options.engine || {};
        engineOpts.timeout = this._options.timeout;
        this._engine = new Engine(engineOpts);

        logger.debug('Created new server: %s', JSON.stringify(this._options));
    }

    close() {
        return this._engine.close();
    }

    openSocket(clientId, socket, request) {
        if (!clientId || !socket) return;
        this._engine.openSocket(clientId, new Socket(this, socket, request));
    }

    closeSocket(clientId, close) {
        this._engine.flushConnection(clientId, close);
    }

    process(messages, request, callback, context) {
        var local = (request === null);

        messages = [].concat(messages);
        logger.debug('Processing messages: %s (local: %s)', messages, local);

        if (messages.length === 0) return callback.call(context, []);
        var processed = 0, responses = [], self = this;

        var gatherReplies = function (replies) {
            responses = responses.concat(replies);
            processed += 1;
            if (processed < messages.length) return;

            var n = responses.length;
            while (n--) {
                if (!responses[n]) responses.splice(n, 1);
            }
            logger.debug('Returning replies: %s', JSON.stringify(responses));
            callback.call(context, responses);
        };

        var handleReply = function (replies) {
            var extended = 0, expected = replies.length;
            if (expected === 0) gatherReplies(replies);

            for (var i = 0, n = replies.length; i < n; i++) {
                logger.debug('Processing reply: %s', JSON.stringify(replies[i]));
                (function (index) {
                    self.pipeThroughExtensions('outgoing', replies[index], request, function (message) {
                        replies[index] = message;
                        extended += 1;
                        if (extended === expected) gatherReplies(replies);
                    });
                })(i);
            }
        };

        for (var i = 0, n = messages.length; i < n; i++) {
            this.pipeThroughExtensions('incoming', messages[i], request, function (pipedMessage) {
                this._handle(pipedMessage, local, handleReply, this);
            }, this);
        }
    }

    _makeResponse(message) {
        var response = {};

        if (message.id)       response.id = message.id;
        if (message.clientId) response.clientId = message.clientId;
        if (message.channel)  response.channel = message.channel;
        if (message.error)    response.error = message.error;

        response.successful = !response.error;
        return response;
    }

    _handle(message, local, callback, context) {
        if (!message) return callback.call(context, []);
        logger.debug('Handling message: %s (local: %s)', JSON.stringify(message), local);

        var channelName = message.channel,
            error = message.error,
            response;

        if (Channel.isMeta(channelName))
            return this._handleMeta(message, local, callback, context);

        if (!Grammar.CHANNEL_NAME.test(channelName))
            error = Error.channelInvalid(channelName);

        if (!error) this._engine.publish(message);

        response = this._makeResponse(message);
        if (error) response.error = error;
        response.successful = !response.error;
        callback.call(context, [response]);
    }

    _handleMeta(message, local, callback, context) {
        var method = Channel.parse(message.channel)[1],
            response;

        if (this.META_METHODS.indexOf(method) < 0) {
            response = this._makeResponse(message);
            response.error = Error.channelForbidden(message.channel);
            response.successful = false;
            return callback.call(context, [response]);
        }

        this[method](message, local, function (responses) {
            responses = [].concat(responses);
            for (var i = 0, n = responses.length; i < n; i++) this._advize(responses[i], message.connectionType);
            callback.call(context, responses);
        }, this);
    }

    _advize(response, connectionType) {
        logger.debug('response.channel', response.channel);
        if ([Channel.HANDSHAKE, Channel.CONNECT].indexOf(response.channel) < 0)
            return;

        var interval, timeout;
        if (connectionType === 'eventsource') {
            interval = Math.floor(this._engine.timeout * 1000);
            timeout = 0;
        } else {
            interval = Math.floor(this._engine.interval * 1000);
            timeout = Math.floor(this._engine.timeout * 1000);
        }

        response.advice = response.advice || {};
        if (response.error) {
            Object.assign(response.advice, {reconnect: 'handshake'});
        } else {
            Object.assign(response.advice, {
                reconnect: 'retry',
                interval: interval,
                timeout: timeout
            });
        }
    }

    // MUST contain  * version
    //               * supportedConnectionTypes
    // MAY contain   * minimumVersion
    //               * ext
    //               * id
    handshake(message, local, callback, context) {
        var response = this._makeResponse(message);
        response.version = '1.0';

        if (!message.version)
            response.error = Error.parameterMissing('version');

        var clientConns = message.supportedConnectionTypes,
            commonConns;

        response.supportedConnectionTypes = SimplePubSub.CONNECTION_TYPES;

        if (clientConns) {
            commonConns = clientConns.filter(function (conn) {
                return SimplePubSub.CONNECTION_TYPES.indexOf(conn) >= 0;
            });
            if (commonConns.length === 0)
                response.error = Error.conntypeMismatch(clientConns);
        } else {
            response.error = Error.parameterMissing('supportedConnectionTypes');
        }

        response.successful = !response.error;
        if (!response.successful) return callback.call(context, response);

        this._engine.createClient(function (clientId) {
            response.clientId = clientId;
            callback.call(context, response);
        }, this);
    }

    // MUST contain  * clientId
    //               * connectionType
    // MAY contain   * ext
    //               * id
    connect(message, local, callback, context) {
        var response = this._makeResponse(message),
            clientId = message.clientId,
            connectionType = message.connectionType;

        this._engine.clientExists(clientId, function (exists) {
            if (!exists)         response.error = Error.clientUnknown(clientId);
            if (!clientId)       response.error = Error.parameterMissing('clientId');

            if (SimplePubSub.CONNECTION_TYPES.indexOf(connectionType) < 0)
                response.error = Error.conntypeMismatch(connectionType);

            if (!connectionType) response.error = Error.parameterMissing('connectionType');

            response.successful = !response.error;

            if (!response.successful) {
                delete response.clientId;
                return callback.call(context, response);
            }

            if (message.connectionType === 'eventsource') {
                message.advice = message.advice || {};
                message.advice.timeout = 0;
            }
            this._engine.connect(response.clientId, message.advice, function (events) {
                callback.call(context, [response].concat(events));
            });
        }, this);
    }

    // MUST contain  * clientId
    // MAY contain   * ext
    //               * id
    disconnect(message, local, callback, context) {
        var response = this._makeResponse(message),
            clientId = message.clientId;

        this._engine.clientExists(clientId, function (exists) {
            if (!exists)   response.error = Error.clientUnknown(clientId);
            if (!clientId) response.error = Error.parameterMissing('clientId');

            response.successful = !response.error;
            if (!response.successful) delete response.clientId;

            if (response.successful) this._engine.destroyClient(clientId);
            callback.call(context, response);
        }, this);
    }

    // MUST contain  * clientId
    //               * subscription
    // MAY contain   * ext
    //               * id
    subscribe(message, local, callback, context) {
        var response = this._makeResponse(message),
            clientId = message.clientId,
            subscription = message.subscription,
            channel;

        subscription = subscription ? [].concat(subscription) : [];

        this._engine.clientExists(clientId, function (exists) {
            if (!exists)               response.error = Error.clientUnknown(clientId);
            if (!clientId)             response.error = Error.parameterMissing('clientId');
            if (!message.subscription) response.error = Error.parameterMissing('subscription');

            response.subscription = message.subscription || [];

            for (var i = 0, n = subscription.length; i < n; i++) {
                channel = subscription[i];

                if (response.error) break;
                if (!local && !Channel.isSubscribable(channel)) response.error = Error.channelForbidden(channel);
                if (!Channel.isValid(channel))                  response.error = Error.channelInvalid(channel);

                if (response.error) break;
                this._engine.subscribe(clientId, channel);
            }

            response.successful = !response.error;
            callback.call(context, response);
        }, this);
    }

    // MUST contain  * clientId
    //               * subscription
    // MAY contain   * ext
    //               * id
    unsubscribe(message, local, callback, context) {
        var response = this._makeResponse(message),
            clientId = message.clientId,
            subscription = message.subscription,
            channel;

        subscription = subscription ? [].concat(subscription) : [];

        this._engine.clientExists(clientId, function (exists) {
            if (!exists)               response.error = Error.clientUnknown(clientId);
            if (!clientId)             response.error = Error.parameterMissing('clientId');
            if (!message.subscription) response.error = Error.parameterMissing('subscription');

            response.subscription = message.subscription || [];

            for (var i = 0, n = subscription.length; i < n; i++) {
                channel = subscription[i];

                if (response.error) break;
                if (!local && !Channel.isSubscribable(channel)) response.error = Error.channelForbidden(channel);
                if (!Channel.isValid(channel))                  response.error = Error.channelInvalid(channel);

                if (response.error) break;
                this._engine.unsubscribe(clientId, channel);
            }

            response.successful = !response.error;
            callback.call(context, response);
        }, this);
    }
}

module.exports = Server;