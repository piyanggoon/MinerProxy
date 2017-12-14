exports.changeWorker = function(params, change) {
    let workerID = params[0];
    if(workerID.indexOf(".") > -1) {
        workerID = workerID.split(".")[1];
        params[0] = change + "." + workerID;
    }
    return params;
};
