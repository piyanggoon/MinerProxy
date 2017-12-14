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
    if(msg.type == "connectPool") {
        connectPool(msg.agent);
    } else if(msg.type == "sendToPool") {
        sendToPool(msg.obj);
    }
});

function connectPool(agent) {
    pool = net.createConnection({
        host: config.host,
        port: config.port
    });

    pool.on('connect', (connect) => {
        console.log("[INFO] Connection pool (" + config.host + ":" + config.port + ")")
        sendToPool({ id: 1, method: "mining.subscribe", params: [agent] });
    });

    pool.pipe(ndjson.parse({ strict: true })).on('data', (obj) => {
        if(pool) {
            if(obj.id == 1) {
                if(obj.error) {
                    console.log("[POOL] subscribing, " + obj.error)
                } else if(typeof obj.result[1] !== 'undefined') {
                    console.log("[POOL] Stratum session id " + obj.result[1]);
                    process.send({ type: "updateSessionID", arg: obj.result[1] });
                }
            } else if(obj.id == 2) {
                if(obj.error) {
                    console.log("[POOL] authorizing, " + obj.error)
                } else if(obj.result) {
                    console.log("[POOL] authorization granted")
                    if(config.xnsub) {
                        sendToPool({ id: 3, method: "mining.extranonce.subscribe", params: [] });
                    }
                } else {
                    console.log("[POOL] authorization failed")
                }
            } else if(obj.id == 3 && config.xnsub) {
                console.log("[POOL][IN] " + JSON.stringify(obj));
            } else {
                if(obj.method == "mining.notify") {
                    //console.log("[POOL] New work: " + obj.params[3]);
                } else if(obj.method == "mining.set_difficulty") {
                    //console.log("[POOL] New diff: " + obj.params[0]);
                } else if(obj.method == "mining.set_extranonce") {
                    console.log("[POOL][IN] " + JSON.stringify(obj));
                } else {
                    if(obj.error == null) {
                        console.log("[POOL] Work #" + obj.id + ", Accepted")
                    } else {
                        console.log("[POOL] Work #" + obj.id + ", Rejected: " + obj.error[1])
                    }
                }
            }

            process.send({ type: "sendToMiner", obj: obj });
        }
    }).on('error', (err) => {
        console.log("[POOL] invalid pool request, " + err)
    });

    pool.on('error', (err) => {
        console.log("[POOL] error, " + err.message)
        process.send({ type: "destroySocket" });
    });

    pool.on('end', () => {
        console.log("[POOL] closed the connection...")
        process.send({ type: "destroySocket" });
    });
}

function sendToPool(obj) {
    if(pool) {
        pool.write(JSON.stringify(obj) + "\n");
    }
}
