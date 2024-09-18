const axios = require('axios');

async function getTask(task) {
    return new Promise(resolve => {
        axios.post("https://api.capsolver.com/createTask", {
            "clientKey": "capsolver token",
            "task": task
        }).then(response => {
            //console.log("New captcha task started " + response.data.taskId);
            resolve(response.data.taskId);
        }).catch(e => {
            console.log(e);
            resolve();
        });
    });
}

async function getCaptchaTask() {
    return await getTask({
        "type": "ReCaptchaV3TaskProxyLess",
        "websiteURL": "https://www.csgoroll.gg/en/withdraw/csgo/p2p",
        "websiteKey": "6LfVf3wUAAAAAL8T79ziKWF-Jmkc3LT9fzEVoiO5",
        "minScore": 0.9,
        "pageAction": "joinTrades"
    });
}

async function getCaptchaTaskResult(taskId) {
    return new Promise(resolve => {
        axios.post("https://api.capsolver.com/getTaskResult", {
            "clientKey": "capsolver token",
            "taskId": taskId
        }).then(response => {
            if (response.data.solution != null) {
                console.log("New captcha token received " + response.data.solution.gRecaptchaResponse.substring(0, 50));
                resolve(response.data.solution.gRecaptchaResponse);
            }
            resolve(null);
        }).catch(e => {
            console.log(e);
            resolve();
        });
    });
}

let loading = false;

async function getCaptcha() {
    if (loading) return;
    loading = true;

    let taskId = await getCaptchaTask();

    let token = waitForCaptchaResult(taskId);

    loading = false;
    return token;
}

async function getVCaptchaTask() {
    return await getTask({
        "type": "ReCaptchaV2Task",
        "websiteURL": "https://www.csgoroll.gg/en/withdraw/csgo/p2p",
        "websiteKey": "6LclF8sUAAAAAHJQQBoSzcZ02qfTSzXaHlffepXF",
    });
}

async function waitForCaptchaResult(taskId) {
    let token;

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        token = await getCaptchaTaskResult(taskId);
        if (token != null) break;
    }

    if (token == null) {
        console.log("Error getting captcha result");
    }

    return token;
}

let vLoading = false;

async function getVCaptcha() {
    if (vLoading) return;
    vLoading = true;

    let taskId = await getVCaptchaTask();

    let token = await waitForCaptchaResult(taskId);

    vLoading = false;
    return token;
}

module.exports = {
    getCaptcha,
    getVCaptcha
}