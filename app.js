const net = require('net');
const ndjson = require('ndjson');
const child = require('child_process');
const helper = require('./modules/helper.js');
const config = require('./config.json');

net.createServer((socket) => {
    socket.agent = "NodeProxy";
    socket.sessionID = null;

    let args = [config.pool.host, config.pool.port, config.pool.worker, config.pool.xnsub];
    socket.pool = child.fork('./modules/pool.js', args);

    socket.pool.on('message', (msg) => {
        if(msg.type == "sendToMiner") {
            socket.write(JSON.stringify(msg.obj) + "\n");
        } else if(msg.type == "updateSessionID") {
            socket.sessionID = msg.arg;
        } else if(msg.type == "destroySocket") {
            destroySocket();
        }
    });

    socket.pipe(ndjson.parse({ strict: true })).on('data', (obj) => {
        if(socket && socket.pool) {
            if(obj.method == "mining.subscribe") {
                if(!socket.sessionID) {
                    socket.agent = obj.params[0];
                    socket.pool.send({ type: "connectPool", agent: socket.agent });
                } else {
                    console.log("[MINER] Pool still alive")
                }
            } else if(obj.method == "mining.authorize") {
                if(socket.sessionID) {
                    obj.id = 2; // authorization
                    obj.params = helper.changeWorker(obj.params, config.pool.worker);
                    console.log("[INFO] New peer connected : " + obj.params[0] + " (" + socket.sessionID + ")")
                    socket.pool.send({ type: "sendToPool", obj: obj });
                } else {
                    console.log("[MINER] No pool session id")
                }
            } else {
                if(obj.method == "mining.submit") {
                    obj.params = helper.changeWorker(obj.params, config.pool.worker);
                    console.log("[MINER] Submit work for " + obj.params[0] + " (" + obj.id + ")");
                }
                socket.pool.send({ type: "sendToPool", obj: obj });
            }
        }
    }).on('error', (err) => {
        console.log("[MINER] invalid miner request, " + err)
    });

    socket.on('error', (err) => {
        console.log("[MINER] error, " + err.message)
        destroySocket();
    });

    socket.on('end', () => {
        console.log("[MINER] closed the connection...")
        destroySocket();
    });

    function destroySocket() {
        if(socket && socket.pool) {
            socket.pool.kill();
            socket.pool = null;
            socket.end();
            socket = null;
        }
    }
}).listen(config.listen.port);
