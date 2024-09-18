const NTP = require('ntp-time').Client;
const crypto = require('crypto');
const fs = require('fs');

const LICENSE_HASH = "aaaaaaaaaaaaaaaaaaaaa";

let publicKey = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAs+OUYk+u9n+v23F36Y7Y
l4N+dNL7oKgWywanxUBsFd8xNlU7Sa+YjWLggNFNI37tfV4YiwrkaUNmFTzYtAXl
bgFyu5cyFugXAKdSrQDUqUseDS1hsHjknCJe/SwIWRdlev0dAO2H+ruPZcCR4b9H
JV6yBKL/RM7TGfOELLtugYyLRrQ33/2Oncq25BalqQDu1NE+Qu6ZetP908kB6dDN
rT1nWwivLcKseVcTYZI0MsHnRotvbQ7W73YjqjSjQ+UecEpIBat3sDw/ha9Zl6Ky
aN7T56kVdNMX8DVoEWcyXJpPkpk8AvmFznkBkaWcQYucW9oBOxN7qoMaoIhjqd08
h7hiMzfh61mL32H1uLmKlKJEUxShj4LuT0PHlzCoxnmWEMRzgcDIh22ZsuO/dDV0
GRA6W00UWNIB74Xu1lAyQm6TX/6lBKqok0Q5RPUvJt3CJVQjda+sNlGe6OSiiJ8o
E5hnNpDUtWCcEDxGZDzt31OKlyizUUjeciuS/AKIEPpqGtJs4FYUwIYO6ni7Mctx
FVAz17YwG72ZMXIzsHyEhrvLnOajMOpzp6pSF/KngexRvRJsrxa5fFfBkmPXd7Lj
RM8G2K8RgIxGz9K76hz1/cu7vaM+9BsKq/cxKTtoy5hlgOvAlsyOh2OtOgo5Ku+h
NnVp7uODgwL3KQdcxrOrk/kCAwEAAQ==
-----END PUBLIC KEY-----`;

const licenseFilePath = "cfg/license";

function loadLicense() {
    let _license = loadFile(licenseFilePath);

    //decrypt the cyphertext using the private key
    let decryptBuffer = Buffer.from(_license, "base64");
    let decrypted = crypto.publicDecrypt(publicKey, decryptBuffer).toString();

    _license = decrypted;

    if (_license == null) {
        console.log("Failed to load license file");
        process.exit(1);
    }

    global.license = JSON.parse(_license);
}

function loadFile(path) {
    if (fs.existsSync(path)) {
        return fs.readFileSync(path).toString("utf8");
    } else {
        console.log("No License found");
        process.exit(1);
    }
}

async function checkLicenseValidity(startup) {
    loadLicense();

    let checksum = await checkFileChecksum();

    //DO NOT LEAVE THIS IN IN PRODUCTIVE VERSION
    //console.log(checksum);

    if (checksum == LICENSE_HASH) {
        if (startup) console.log("License valid");
    } else {
        console.log("License file manipulated, if this is an error reach out to me :)");
        process.exit(1);
    }

    let notExpired = await checkExpired(startup);

    if (!notExpired) {
        process.exit(1);
    } else {
        return true;
    }
}

async function checkFileChecksum() {
    return new Promise((resolve) => {
        fs.readFile(licenseFilePath, function (err, data) {
            if (err != null) {
                console.log("Error reading license file");
                console.log(err);
                process.exit(1);
            }
            resolve(generateChecksum(data));
        });
    })
}

function generateChecksum(str, algorithm, encoding) {
    return crypto
        .createHash(algorithm || 'sha256')
        .update(str, 'utf8')
        .digest(encoding || 'hex');
}

async function checkExpired(startup) {
    let date = await getDate();

    if (date != null) {
        let d = new Date(date.time);
        let expirationDate = new Date(license.end_date);

        if (expirationDate == null) {
            console.log("License invalid");
            process.exit(1);
        }

        if (d < expirationDate) {
            if (startup) {
                let days = datediffDays(d, expirationDate);
                let hours = datediffHours(d, expirationDate);
                let minutes = datediffMinutes(d, expirationDate);
                console.log(days, "days", (hours - days * 24), "hours", (minutes - hours * 60), "minutes", "left until license expires");
            }
            return true;
        } else {
            console.log("License expired");
            process.exit(1);
        }
    }
}

function datediffDays(first, second) {
    return Math.floor((second - first) / (1000 * 60 * 60 * 24));
}

function datediffHours(first, second) {
    return Math.floor((second - first) / (1000 * 60 * 60));
}

function datediffMinutes(first, second) {
    return Math.floor((second - first) / (1000 * 60));
}

async function getDate() {
    return new Promise((resolve) => {
        const client = new NTP(global.license.date_server_url, 123, { timeout: 5000, });
        client
            .syncTime()
            .then(time => {
                resolve(time);
            })
            .catch(console.log);
    });
}

module.exports = {
    checkLicenseValidity
}