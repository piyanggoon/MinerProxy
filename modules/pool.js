const net = require('net');
const ndjson = require('ndjson');

var pool;
var config = {
    host: process.argv[2],
    port: process.argv[3],
    worker: process.argv[4],
    xnsub: process.argv[5]
};

process.on('message', (msg) => {
    if(msg.cmd == "connectPool") {
        connectPool(msg.agent);
    } else if(msg.cmd == "send") {
        send(msg.obj);
    }
});

function connectPool(agent) {
    pool = net.createConnection({
        host: config.host,
        port: config.port
    });

    pool.on('connect', (connect) => {
        console.log("[INFO] Connection pool (" + config.host + ":" + config.port + ")")
        send({ id: 1, method: "mining.subscribe", params: agent });
    });

    pool.pipe(ndjson.parse({ strict: true })).on('data', (obj) => {
        if(obj.id == 1) { // mining.subscribe
            if(obj.error) {
                console.log("[POOL] Subscribing, " + obj.error)
            } else if(typeof obj.result[1] !== 'undefined') {
                console.log("[POOL] Stratum session id " + obj.result[1]);
                process.send({ cmd: "sessionID", sessionID: obj.result[1] });
            }
        } else if(obj.id == 2) { // mining.authorize
            if(obj.result) {
                console.log("[POOL] Authorization granted")
                if(config.xnsub) {
                    send({ id: 3, method: "mining.extranonce.subscribe", params: [] });
                }
            } else if(obj.error) {
                console.log("[POOL] Authorizing, " + obj.error)
            } else {
                console.log("[POOL] Authorization failed")
            }
        } else if(obj.id == 3 && config.xnsub) { // mining.extranonce.subscribe
            //console.log("[POOL][IN] " + JSON.stringify(obj));
        } else {
            if(typeof obj.method !== 'undefined') {
                if(obj.method == "mining.set_extranonce") {
                    //console.log("[POOL][IN] " + JSON.stringify(obj));
                }
            } else {
                if(!obj.error) {
                    console.log("[POOL] Work #" + obj.id + ", Accepted")
                } else {
                    console.log("[POOL] Work #" + obj.id + ", Rejected: " + obj.error[1])
                }
            }
        }
        process.send({ cmd: "send", obj: obj });
    }).on('error', (err) => {
        console.log("[POOL] Invalid pool request, " + err)
    });

    pool.on('error', (err) => {
        console.log("[POOL] Error, " + err.message)
        process.send({ cmd: "closeSocket" });
    });

    pool.on('end', () => {
        console.log("[POOL] Closed the connection...")
        process.send({ cmd: "closeSocket" });
    });
}

function send(obj) {
    if(pool) {
        pool.write(JSON.stringify(obj) + "\n");
    }
}
