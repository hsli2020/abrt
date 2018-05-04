const DEBUG = 1;

/**
 * connects to the background script, and stores the Port in a variable myPort
 */
var myPort = browser.runtime.connect({name:"port-from-cs"});

/**
 * listens for messages on myPort
 */
myPort.onMessage.addListener(handleMessage);

var interval = 2000;
var stopped = true;
var licenseNum;
var testCenter;
var startDate;
var endDate;
var testClass;
var scanOnly;
var holdGuid;

function handleMessage(m) {
    switch (m.type) {
    case 'start':
        licenseNum = m.info.licenseNum;
        testCenter = m.info.testCenter;
        startDate  = m.info.startDate;
        endDate    = m.info.endDate;
        testClass  = m.info.testClass;
        scanOnly   = m.info.scanOnly;
        start();
        break;

    case 'stop':
        stop();
        break;
    }
}

function sendMessage(m) {
    myPort.postMessage({type: 'message', message: m});
}

function sendDates(d) {
    myPort.postMessage({type: 'dates', dates: d});
}

function sendTimes(t) {
    myPort.postMessage({type: 'times', times: t});
}

function beep() {
    myPort.postMessage({type: 'beep' });
}

function sound() {
    myPort.postMessage({type: 'sound' });
}

function dpr(arg) {
    if (DEBUG) {
        console.log(arg);
    }
}

/**
 * sends messages to the background script, using myPort
 */
document.body.addEventListener("click", function() {
    // myPort.postMessage({output:'ping'});
    //fillForm();
});

function start() {
    if (stopped) {
        stopped = false;
        setTimeout(query, interval);
        // query();
    }
}

function stop() {
    stopped = true;
}

function query() {
    if (stopped) {
        return;
    }

    getAvailBookingDates(startDate, endDate, testCenter, testClass);
}

function hold(time) {
    sendMessage('<b>HOLD ' + time.timeslot + '</b>');
    holdAppointment(testCenter, testClass, time.timeslot);
}

/**
 * call API
 */
function getServiceId(centerName, testClass) {
    var centers = {
        Oshawa:    { G2: 18295, G: 18382 },

        Lindsay:   { G2: 12576, G: 12577 },
        Barrie:    { G2: 12160, G: 12161 },
        Brampton:  { G2: 12196, G: 12197 },
        Guelph:    { G2: 12405, G: 12406 },
        London:    { G2: 12594, G: 12595 },
        PortUnion: { G2: 12777, G: 12778 },
        Newmarket: { G2: 12120, G: 12121 }
    };

    return centers[centerName][testClass];
}

// getServiceId('Oshawa', 'G2');
// getServiceId('Oshawa', 'G');
// getServiceId('Lindsay', 'G2');
// getServiceId('Lindsay', 'G');

function getAvailBookingDates(startDate, endDate, testCenter, testClass) {

    var year, month, day,

    [ year, month, day ] = endDate.split('-');

    // serviceId is not working, don't know why?
    var svcid = getServiceId(testCenter, testClass);

    var url = "https://drivetest.ca/booking/v1/booking/" + svcid + "?month=" + month + "&year=" + year;

    fetch(url, {
        method: "GET",
        credentials: "same-origin"
    })
    .then(function(response) {
        //console.log(response);
        return response.json();
    })
    .then(function(json) {
      //dpr(url);
        dpr('getAvailDates');
        dpr(json);

        sendDates(json.availableBookingDates);

        for (var i = 0; i < json.availableBookingDates.length; i++) {
            var abd = json.availableBookingDates[i];
            if (abd.description == 'UNAVAILABLE' || abd.description == 'FULL') {
                continue;
            }

            var dt = new Date(year, month-1, abd.day);
            var ymd = dt.toISOString().substring(0, 10);

            dpr(ymd + ' ' + abd.description);

            if (ymd >= startDate && ymd <= endDate) {
                getAvailBookingTimes(ymd, testCenter, testClass);
            }
        }

        if (!stopped) {
            setTimeout(query, interval);
        }
    })
    .catch(function(error) {
        console.log('Error on getAvailBookingDates: ' + error.message);
    });
}

function getAvailBookingTimes(date, testCenter, testClass) {

    var svcid = getServiceId(testCenter, testClass);

    var url = "https://drivetest.ca/booking/v1/booking?date=" + date + "&is=" + svcid;

    fetch(url, {
        method: "GET",
        credentials: "same-origin"
    })
    .then(function(response) {
        //console.log(response);
        return response.json();
    })
    .then(function(json) {
      //dpr(url);
        dpr('getAvailTimes');
        dpr(json);

        if (json.availableBookingTimes.length > 0) {
            sendTimes(json.availableBookingTimes);
            if (scanOnly) {
                beep();
                return;
            }
            hold(json.availableBookingTimes[0]);
        }

        //for (var i = 0; i < json.availableBookingTimes.length; i++) {
        //    var abt = json.availableBookingTimes[i];
        //    console.log(date + ' ' + abt.timeslot);
        //}
    })
    .catch(function(error) {
        console.log('Error on getAvailBookingTimes: ' + error.message);
    });
}

function getStatusToken(licenseNum) {
    var url = "https://drivetest.ca/booking/v1/status";

    fetch(url, {
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ licenseNumber: licenseNum })
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(json) {
      //dpr(url);
        dpr('getStatusToken');
        dpr(json);

        dpr(json.statusToken);
    })
    .catch(function(error) {
        console.log('Error on getStatusToken: ' + error.message);
    });
}

function holdAppointment(testCenter, testClass, time) {
    var url = "https://drivetest.ca/booking/v1/booking/hold";

    var svcid = getServiceId(testCenter, testClass);

    fetch(url, {
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
            serviceId: svcid,
            time: time,
            licenceClass: testClass,
            frenchTest: false
        })
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(json) {
      //dpr(url);
        dpr('hold');
        dpr(json);

        if (json.success) {
            holdGuid = json.guid;
            payFee(testClass);
        }
    })
    .catch(function(error) {
        console.log('Error on holdAppointment: ' + error.message);
    });
}

function payFee(testClass) {
    var url = "https://drivetest.ca/booking/v1/booking/fees";

    fetch(url, {
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
            licenceClass: testClass,
            reschedule: false,
            existingAppointmentGuid: null
        })
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(json) {
      //dpr(url);
        dpr('payfees');
        dpr(json);

        complete(testClass, holdGuid);
    })
    .catch(function(error) {
        console.log('Error on payFee: ' + error.message);
    });
}

function complete(testClass, holdGuid) {
    var url = "https://drivetest.ca/booking/v1/booking/complete";

    var now = (new Date()).getTime();

    fetch(url, {
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
            appointmentHoldGuid: holdGuid,
            confirmationNumber: "",
            timestamp: now,
            licenceClass: testClass
        })
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(json) {
      //dpr(url);
        dpr('complete');
        dpr(json);
        dpr('<img src="data:image/png;base64,' + json.barcode + '" />');

        sendMessage(json.displayId);
        sendMessage('<img width="220" height="32" src="data:image/png;base64,' + json.barcode + '" />');
        stop();
        sound();
    })
    .catch(function(error) {
        console.log('Error on complete: ' + error.message);
    });
}

// console.log('--injected--');
// console.log(getServiceId('Oshawa', 'G'));
// getAvailBookingDates('2017-11-29', 'Oshawa', 'G');

function fillForm() {
    var e = document.getElementById("emailAddress");
    if (e) e.value = "lihsca@gmail.com";

    e = document.getElementById("confirmEmailAddress");
    if (e) e.value = "lihsca@gmail.com";

    e = document.getElementById("licenceNumber");
    if (e) e.value = "Z3187-79607-06108";

    e = document.getElementById("licenceExpiryDate");
    if (e) e.value = "2020/01/29";
}
