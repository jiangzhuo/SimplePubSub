# SimplePubSub

这是一个参考[faye](https://github.com/faye/faye)的简单的pub/sub系统, 只实现服务端部分.  
### 关于测试  
* 可以使用curl测试HTTP接口  
* 可以使用telnet测试TCP接口  
* 可以使用Faye.Client测试Websocket接口  
* 所有接口数据格式均为json

### 服务端结构  
参考下图  
![服务端结构](http://faye.jcoglan.com/images/faye-internals.png)

### 特点  
* 尝试使用ES6的新特性
* 支持多种常见接口
* 支持灵活的消息路由

### TBD
* 单元测试
* 增强稳定性 
* logger
* 增加worker通知的协议
* 实现TCP接口客户端的心跳功能  

### 接口(固有channel)  

#### /meta/handshake
握手,获取ClientId  
* **channel** /meta/handshake  
* **version** 使用的版本号,要使用与服务端兼容的版本  
* **supportedConnectionTypes** 支持的接口类型  
* **id** request和response对应的标示  

#### /meta/connect  
使用clientId注册一个链接,如果已经有链接可以用于表示心跳  
* **channel**  
* **clientId** 握手分配的id  
* **connectionType** 链接接口类型  
* **id**

#### /meta/subscribe  
订阅一个channel  
* **channel**  
* **clientId**  
* **subscription** 订阅的频道的名称,要符合`/^\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+(\/(((([a-z]|[A-Z])|[0-9])|(\-|\_|\!|\~|\(|\)|\$|\@)))+)*$/`  
* **id**  

#### /meta/unsubscribe  
取消订阅一个channel  
同`/meta/subscribe`  

#### /meta/disconnect  
断开链接

### 心跳
暂时的方法是发送一个`/meta/connect`请求表示心跳  


### 示例

#### 服务端
参考examples目录下的例子  

#### 客户端

##### TCP接口 使用telnet  

`
 telnet 127.0.0.1 8001
 Trying 127.0.0.1...
 Connected to localhost.
 Escape character is '^]'.
`

发送handshake请求  

`
[{"channel":"/meta/handshake","version":"1.0","supportedConnectionTypes":["tcp"],"id":"1"}]
`

handshake返回成功结果如下    

`
[{"id":"1","channel":"/meta/handshake","successful":true,"version":"1.0","supportedConnectionTypes":["long-polling","cross-origin-long-polling","callback-polling","websocket","eventsource","in-process","tcp"],"clientId":"b8eefea0-a94b-11e5-8160-d558d3f94685","advice":{"reconnect":"retry","interval":0,"timeout":20000}}]
`

发送connect请求  

`
[{"channel":"/meta/connect","clientId":"b8eefea0-a94b-11e5-8160-d558d3f94685","connectionType":"tcp","id":"2"}]
`

connect请求成功

`
{"id":"2","clientId":"b8eefea0-a94b-11e5-8160-d558d3f94685","channel":"/meta/connect","successful":true,"advice":{"reconnect":"retry","interval":0,"timeout":20000}}  
`

发送subscribe请求订阅pong频道  

`
[{"channel":"/meta/subscribe","clientId":"b8eefea0-a94b-11e5-8160-d558d3f94685","subscription":"/pong","id":"3"}]
`

subscribe请求成功  

`
[{"id":"3","clientId":"b8eefea0-a94b-11e5-8160-d558d3f94685","channel":"/meta/subscribe","successful":true,"subscription":"/pong"}]
`

向pong频道发送消息

`
[{"channel":"/pong","data":{},"clientId":"b8eefea0-a94b-11e5-8160-d558d3f94685","id":"4"}]
`

收到来自pong频道的消息

`
[{"channel":"/pong","data":{},"id":"4"}]
`

取消订阅pong频道  

`
[{"channel":"/meta/unsubscribe","clientId":"b8eefea0-a94b-11e5-8160-d558d3f94685","subscription":"/pong","id":"5"}]
`  

##### HTTP接口 使用curl  

向pong频道发送消息的POST请求

`
curl -X POST -H "Content-Type: application/json" -H "Cache-Control: no-cache" -H -d '{"channel":"/pong","data":{}}' 'http://localhost:8000/bayeux'
`
