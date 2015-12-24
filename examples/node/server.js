var fs = require('fs'),
    path = require('path'),
    http = require('http'),
    https = require('https'),
    net = require('net'),
    mime = require('mime'),
    deflate = require('permessage-deflate'),
    simplePubSub = require('../../lib/index.js'),
    NodeAdapter = simplePubSub.NodeAdapter;

simplePubSub.logger = console.log;
var SHARED_DIR = __dirname + '/..',
    bayeux = new NodeAdapter({mount: '/bayeux', timeout: 2000}),
    port = process.argv[2] || '8000',
    secure = process.argv[3] === 'tls',
    key = fs.readFileSync(SHARED_DIR + '/server.key'),
    cert = fs.readFileSync(SHARED_DIR + '/server.crt');

bayeux.addWebsocketExtension(deflate);

var handleRequest = function (request, response) {
    response.end('Not handle other http request');
};

var server = secure
    ? https.createServer({cert: cert, key: key}, handleRequest)
    : http.createServer(handleRequest);

bayeux.attach(server);
server.listen(Number(port));

var server1 = net.createServer();
bayeux.attach(server1);
server1.listen(8001);

//bayeux.getClient().subscribe('/chat/*', function(message) {
//    console.log('[' + message.user + ']: ' + message.message);
//});

bayeux.on('subscribe', function (clientId, channel) {
    console.log('[  SUBSCRIBE] ' + clientId + ' -> ' + channel);
});

bayeux.on('unsubscribe', function (clientId, channel) {
    console.log('[UNSUBSCRIBE] ' + clientId + ' -> ' + channel);
});

bayeux.on('disconnect', function (clientId) {
    console.log('[ DISCONNECT] ' + clientId);
});