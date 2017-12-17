const net = require('net');
const ndjson = require('ndjson');
const child_process = require('child_process');
const helper = require('./modules/helper.js');
const config = require('./config.json');

net.createServer((socket) => {
    socket.sessionID = null;

    let args = [config.pool.host, config.pool.port, config.pool.worker, config.pool.xnsub];
    socket.pool = child_process.fork('./modules/pool.js', args);

    socket.pool.on('message', (msg) => {
        if(msg.cmd == "send") {
            socket.write(JSON.stringify(msg.obj) + "\n");
        } else if(msg.cmd == "sessionID") {
            socket.sessionID = msg.sessionID;
        } else if(msg.cmd == "closeSocket") {
            closeSocket();
        }
    });

    socket.pipe(ndjson.parse({ strict: true })).on('data', (obj) => {
        if(socket && socket.pool) {
            if(obj.method == "mining.subscribe") {
                if(!socket.sessionID) {
                    socket.pool.send({ cmd: "connectPool", agent: obj.params });
                    return;
                } else {
                    console.log("[MINER] Connection still alive")
                }
            } else if(obj.method == "mining.authorize") {
                if(socket.sessionID) {
                    obj.id = 2; // mining.authorize
                    obj.params = helper.changeWorker(obj.params, config.pool.worker);
                    console.log("[INFO] New peer connected : " + obj.params[0] + " (" + socket.sessionID + ")")
                } else {
                    console.log("[MINER] No pool session id")
                }
            } else if(obj.method == "mining.submit") {
                obj.params = helper.changeWorker(obj.params, config.pool.worker);
                console.log("[MINER] Submit work for " + obj.params[0] + " (" + obj.id + ")");
            }
            socket.pool.send({ cmd: "send", obj: obj });
        }
    }).on('error', (err) => {
        console.log("[MINER] Invalid miner request, " + err)
    });

    socket.on('error', (err) => {
        console.log("[MINER] Error, " + err.message)
        closeSocket();
    });

    socket.on('end', () => {
        console.log("[MINER] Closed the connection...")
        closeSocket();
    });

    function closeSocket() {
        if(socket && socket.pool) {
            socket.pool.kill();
            socket.pool = null;
            socket.end();
            socket = null;
        }
    }
}).listen(config.listen.port);
