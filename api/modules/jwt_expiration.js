const { jwtDecode } = require("jwt-decode");

function convertSecondsToHoursMinutes(seconds) {
  // Calculate hours
  let hours = Math.floor(seconds / 3600);
  
  // Calculate remaining seconds after subtracting the hours
  let remainingSeconds = seconds % 3600;
  
  // Calculate minutes
  let minutes = Math.floor(remainingSeconds / 60);
  
  return { hours: hours, minutes: minutes };
}

function getExpiration(token) {
    const decoded = jwtDecode(token);

    
    let seconds = new Date().getTime() / 1000;

    let diff = decoded.exp - seconds;

    let time = convertSecondsToHoursMinutes(diff);
    return time
}

module.exports = {
    getExpiration
}