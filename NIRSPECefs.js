/* NIRSPEC */

var echellecanvas = document.getElementById("echelle");
var ecwidth = parseInt(window.getComputedStyle(document.getElementById("container"),null).getPropertyValue("width"));
echellecanvas.width=1.5 * ecwidth;

var ctx = echellecanvas.getContext("2d");
var spectrumgraph = document.getElementById("spectrumgraph");
spectrumgraph.scrollTop = (spectrumgraph.scrolltop+50).toString();

const angstroms_per_micron = 10000;
const mm_per_meter = 1000;
const mm_per_angstrom = .0000001;
const MAXO = 100;

const MM_PER_PIXEL = 0.037; // 1/27 or 27/10000?
const PRECISION = 4;

const DETECTOR_HEIGHT = 1024;
const DETECTOR_WIDTH = 1024;
const DETECTOR_NUMBER = 1;

// const arcsec_width = 7;
const ARCSECONDS_PER_PIXEL = 0.193;

const MARKER_COLOR = "white";

const color = "violet";

/* hardware constants */

var true_max_wavelength = 5.6*angstroms_per_micron;
var true_min_wavelength = 0.92*angstroms_per_micron;
var max_wavelength = true_max_wavelength;
var min_wavelength = true_min_wavelength;

var camera_focal_length = 0.763;
var collimator_focal_length = 4.155;

// main (echelle)
var sigma = 43.103; // 1/ruling density in microns
var delta = 63.5; // echelle blaze
var theta = 5.000; // original: 5

// cross disperser (STILL USING HIRES DATA)
var xddeltad = 4.449;
var xdalfbet = 40.0;
var xdsigma  = 13.33;
var xdsigmai = 250.0; // cross disperser lines/mm

// echelle-specific
var ecsigma = sigma;
var ecthetad = theta;
var ecdeltad = delta;

document.getElementById("FindEchelleAngle").value = ecdeltad;
document.getElementById("FindCrossDisperserAngle").value = xddeltad;
document.getElementById("EchelleAngle").innerHTML = "Echelle Angle:<br>"+ecdeltad.toString()+String.fromCharCode(176);
// document.getElementById("CrossDisperserAngle").innerHTML = "Cross Disperser Angle:<br>"+xddeltad.toString()+String.fromCharCode(176);

var base;  // echelle grating constant m*lambda in microns
var demag; // resulting magnification as if there were no dispersers
var bwav;  // the blaze wavelenght of an order in microns
var f2dbdl;  // factor required to compute length on detector of FSR of an order
var xdalphad;// the incident angle (alpha) in degrees
var sinalpha;// sine of the incident angle
var xdangle; // cross disperser angle (not the one that moves)
var FSR_2beta;

var i;

var fsr = new Array(MAXO);     // Free Spectral Range (mm) of each order
var FSR_2beta = new Array(MAXO); // width of FSR * beta (mm) of each order
var order = new Array(MAXO);      // mapping from 0-n indices to order numbers
var wv = new Array(MAXO);      // blaze wavelength of each order
var xbeta = new Array(MAXO);
var x = new Array(MAXO);     // cross disperser displacement at camera (mm)
var delx = new Array(MAXO);    // tilt delta (mm)
var minwv = new Array(MAXO);

var linewidths = new Array(MAXO);

var base;
var max_order_number;
var min_order_number;
var number_of_orders;

var temp;

var echellerect = echellecanvas.getBoundingClientRect();
// console.log(echellerect.top, echellerect.right, echellerect.bottom, echellerect.left);
var X_LOWER_LIMIT = 10;          //  Lower limit on coord in X direction
var X_UPPER_LIMIT = parseInt(window.getComputedStyle(document.getElementById("container"),null).getPropertyValue("width"));      //  Upper limit on coord in X direction
var Y_LOWER_LIMIT = 10;          //  Lower limit on coord in Y direction
var Y_UPPER_LIMIT = echellerect.bottom;
// var ZOOM = 4.5*((echellerect.right-echellerect.left)/600);
var ZOOM = parseFloat(document.getElementById("zoom").value)/2;;

// console.log(ZOOM);

var endpoints;
var drawable;

var adjusted_x=0;
var adjusted_y=0;
var ord;
var lambda;
var ecangle;
var cross_disperser_wavelength;
var xdangle;

var drag=false;
var clear=false;

var xdragoffset;
var ydragoffset;

var detectordim = [0,0];

var plottedwavelengths = [];
var url;
var filter = "N1";

function transform_mm_to_screen_pixels(mm) {
    var pixels = [0,0];
    pixels[0] = Math.round(FOCAL_PLANE_SCREEN_POSITION[0] + ( ZOOM * mm[0] )); // TODO: solve equation so focal position 0 = halfway down the screen
    pixels[1] = Math.round(FOCAL_PLANE_SCREEN_POSITION[1] + ( -ZOOM * mm[1] ));
    return pixels;
  }

function transform_screen_pixels_to_mm( px, py) {
  var mm = [0,0];
  mm[0] = ( px - FOCAL_PLANE_SCREEN_POSITION[0] - X_LOWER_LIMIT) / ZOOM;
  mm[1] = ( py - FOCAL_PLANE_SCREEN_POSITION[1] - Y_LOWER_LIMIT) / (-ZOOM);
  return mm;
}

function drawEchelle() {

  var max_wavelength = true_max_wavelength;
  var min_wavelength = true_min_wavelength;

  switch(filter) {
    case "N1":
      max_wavelength = 1.121;
      min_wavelength = 0.947;
      break;
    case "N2":
      max_wavelength = 1.293;
      min_wavelength = 1.089;
      break;
    case "N3":
      max_wavelength = 1.375;
      min_wavelength = 1.143;
      break;
    case "N4":
      max_wavelength = 1.593;
      min_wavelength = 1.241;
      break;
    case "N5":
      max_wavelength = 1.808;
      min_wavelength = 1.413;
      break;
    case "N6":
      max_wavelength = 2.315;
      min_wavelength = 1.558;
      break;
    case "N7":
      max_wavelength = 2.630;
      min_wavelength = 1.839;
      break;

  }

  min_wavelength*=angstroms_per_micron;
  max_wavelength*=angstroms_per_micron;

  var detector = document.getElementById("draggable");
  detectordim = [(DETECTOR_WIDTH *  MM_PER_PIXEL * ZOOM),DETECTOR_NUMBER*(DETECTOR_HEIGHT * MM_PER_PIXEL * ZOOM +1)];
  detector.style.width = detectordim[0].toString()+'px';
  detector.style.height = detectordim[1].toString()+'px';

  // console.log(detectordim);
  
  var arcsec_width = parseFloat(document.getElementById('switchSlit').value);
  var line_width = (MM_PER_PIXEL*arcsec_width*ZOOM/ARCSECONDS_PER_PIXEL);
  // console.log(line_width); Math.round

  f2dbdl = camera_focal_length * mm_per_meter / ( sigma * Math.cos( (delta - theta) * Math.PI/180 ) );

  xdangle = 0;
  xdalphad = xdangle + xddeltad + xdalfbet*0.5;
  sinalpha = Math.sin( xdalphad * Math.PI / 180 );
  
  // console.log("f2dbdl:"+f2dbdl.toString())

  fsr = new Array(MAXO);     // Free Spectral Range (mm) of each order
  FSR_2beta = new Array(MAXO); // width of FSR * beta (mm) of each order
  order = new Array(MAXO);      // mapping from 0-n indices to order numbers
  wv = new Array(MAXO);      // blaze wavelength of each order
  xbeta = new Array(MAXO);
  x = new Array(MAXO);     // cross disperser displacement at camera (mm)
  delx = new Array(MAXO);    // tilt delta (mm)
  endpoints=[];
  drawable=[];

  base = 2.0 * sigma * Math.sin( delta * Math.PI/180 ) * Math.cos( theta * Math.PI/180 );
  max_order_number = Math.round( angstroms_per_micron * base / min_wavelength + 0.5 ) + 1;
  min_order_number = Math.round(angstroms_per_micron * base / max_wavelength - 0.5);
  number_of_orders = (max_order_number - min_order_number - 1);

  var central_order = Math.round((max_order_number-min_order_number)/2);

  // console.log(number_of_orders);



  //console.log("drawing: "+number_of_orders.toString()+" "+color+" orders from "+min_order_number.toString()+" to "+max_order_number.toString());
  // console.log("drawing orders from "+min_order_number.toString()+" to "+max_order_number.toString());
  // console.log(base);
  // console.log(number_of_orders.toString()+" orders drawn");

  i = -1;
  var mi=0;

  for ( mi = max_order_number; mi >= min_order_number; mi-- ) {
    i++;

    order[i] = mi;
    bwav = base / order[i];      // blaze wavelength of order i in microns
    wv[i] = bwav * angstroms_per_micron;  // blaze wavelength or order i in Angstroms
    fsr[i] = wv[i] / order[i];   // Free Spectral Range of order i in Angstroms
    FSR_2beta[i]= bwav * f2dbdl;     // length of fsr in mm
  }

  temp = (xdangle + xddeltad - xdalfbet * 0.5) * Math.PI/180;

  for ( i = 0; i <= number_of_orders+1; i++ ) {
    xbeta[i] = Math.asin( xdsigmai * mm_per_angstrom * wv[i] - sinalpha );
  }

  for ( i = 0; i <= number_of_orders+1; i++ ) {
    x[i] = ( xbeta[i] - temp) * camera_focal_length * mm_per_meter;
  }

  for ( i = 1; i <= number_of_orders; i++ ) {
    delx[i] = 0.5 * ( x[i+1] - x[i-1] );  // for subseq tilt calcs
  }

  FOCAL_PLANE_SCREEN_POSITION = [ Math.round((X_UPPER_LIMIT-X_LOWER_LIMIT)/2), (10*X_LOWER_LIMIT) + (ZOOM * 0.5 * (x[number_of_orders] + x[number_of_orders-1]))];

  // console.log(FOCAL_PLANE_SCREEN_POSITION);

  for (i=1; i<=number_of_orders; i++) {
    var mm1 = [0, 0];    // blue end of an order in focal plane mm
    var mm2 = [0, 0];    // red  end of an order in focal plane mm
    var scr1 = [0, 0];    // blue end of an order in screen pixels
    var scr2 = [0, 0];    // red  end of an order in screen pixels

    mm1[0] = -0.5 * FSR_2beta[i];
    mm2[0] = 0.5 * FSR_2beta[i];

    mm1[1] = 0.5 * (x[i] + x[i - 1]);
    mm2[1] = 0.5 * (x[i] + x[i + 1]);

    scr1 = transform_mm_to_screen_pixels(mm1);
    scr2 = transform_mm_to_screen_pixels(mm2);

    endpoints.push([scr1[0], scr1[1], scr2[0], scr2[1]]);
    // these are the midpoints of each echelle
  }

  // console.log("found midpoints");

  // // find width of each order
  // for (i=1; i<=number_of_orders; i++) {

  //   linewidths[i] = ;
  // }

  ctx.beginPath();
  ctx.strokeStyle = 'black';
  ctx.fillStyle = 'rgba(169,72,72,0.5)';
  ctx.lineWidth = 1;

  // draw the echellogram!
  for (i = 0; i < endpoints.length; i++) {
    var pts = endpoints[i];
    var thickness = Math.round(line_width/2);
    ctx.moveTo(pts[0],pts[1]+thickness);
    ctx.lineTo(pts[2],pts[3]+thickness);
    ctx.lineTo(pts[2],pts[3]-thickness);
    ctx.lineTo(pts[0],pts[1]-thickness);
    ctx.lineTo(pts[0],pts[1]+thickness);
    ctx.stroke();
    ctx.closePath();
    ctx.fill();

    minwv[i] = findLambda(i,pts[0],pts[1]);

    // console.log("line from ("+pts[0].toString()+","+pts[1].toString()+") to ("+pts[2].toString()+","+pts[3].toString()+")");
  }

  // console.log(minwv);

  // findLambdaLocation(17146,false,false);

  findLambdaLocation(parseInt(document.getElementById("lambdainput").value),false,false);
  
  if (!clear) {
    // setDetectorPositionWavelength();
  }

  // console.log(plottedwavelengths.length);
  for (var count=0; count<plottedwavelengths.length; count++) {
    if (parseInt(plottedwavelengths[count]) < max_wavelength && parseInt(plottedwavelengths[count]) > min_wavelength) {
      // console.log(count.toString()+" "+plottedwavelengths[count].toString());
      findLambdaLocation(plottedwavelengths[count],true,false);
    } 
  }

  clear=false;

  // console.log(document.getElementById("detectordraggable"))

}

window.onload = drawEchelle();
window.onload = setDetectorPositionAngle();

function OffCenterXheight(x_cursor, order_number) {

  var point = endpoints[order_number];

  if ( point == undefined){
    return undefined;
  }

  var slope = -(point[1]-point[3])/(point[2]-point[0]);
  xheight = (slope*(x_cursor-point[0]))+point[1];

  return Math.round(xheight);
}

function findOrderIndex(cursor_x, cursor_y) {
  var index = 83;
  var distance = 1000;

  for (var counter = 0; counter <= number_of_orders; counter++) {
    var dist = Math.abs(cursor_y - OffCenterXheight(cursor_x,counter));
    if (dist < distance) {
      distance = dist;
      index = counter;
    }
  }

  return index;
}

function findLambda(orderindex, cursor_x, cursor_y) {
  // original x is in millimeters
  var xmm = transform_screen_pixels_to_mm(cursor_x,cursor_y)[0];

  var order_at_cursor = order[orderindex];

  var blaze_lambda_at_cursor = wv[orderindex];
  var dispamm = fsr[orderindex] / FSR_2beta[orderindex]; //converts free spectral range to mm
  var lambda_at_cursor = blaze_lambda_at_cursor + dispamm * xmm;

  var y1 = x[orderindex];
  y1 = y1 + delx[orderindex] * (cursor_x)/FSR_2beta[orderindex];
//    y1 = y1 - delx[ orderindex ] * (cursor_x)/FSR_2beta[orderindex];
  var dy1 = ( (cursor_y) - y1 ) / delx[orderindex];

  if ( dy1 > 0 ) {
    cross_disperser_wavelength = lambda_at_cursor + ( wv[orderindex+1] - wv[orderindex] ) * dy1;
  }
  else {
    cross_disperser_wavelength = lambda_at_cursor + ( wv[orderindex] - wv[orderindex-1] ) * dy1;
  }


  return lambda_at_cursor;
}

function findLambdaOrderIndex(wav) {

  for(i=number_of_orders; i>0; i--) {
    if (wav > minwv[i]) {
      if (wav < minwv[i+1]) {
        return i;
      }
    }
  }

  return number_of_orders;

}

function findLambdaLocation(waveln, set, add) {

  waveln = parseInt(waveln);

  if(waveln<min_wavelength || waveln>max_wavelength) {
    // if(waveln<6){
    //   waveln=waveln*angstroms_per_micron;
    // }
    // else {
    return;
    // }
  }

  if(waveln==0) {
    return [0,0];
  }

  if(add != true) {
    add=false;
  }

  // console.log(waveln);

  // var waveln = document.getElementById("FindLambda").value;

  // console.log("finding wavelength location");

  var lindex = findLambdaOrderIndex(waveln);

  var lorder = order[lindex];
  var ordpoints = endpoints[lindex];
  var lmaxwv = findLambda(lindex,ordpoints[2],ordpoints[3]);
  var lminwv = minwv[lindex];

  var percentwvln = (waveln-lminwv)/(lmaxwv-lminwv);

  var lambdax = Math.round(ordpoints[0]+percentwvln*(ordpoints[2]-ordpoints[0]));
  var lambday = Math.round(ordpoints[1]+percentwvln*(ordpoints[3]-ordpoints[1]));

  // if(lambday == undefined) {
  //   console.log('components:');
  //   console.log(ordpoints[1].toString()+" + ("+percentwvln.toString()+" * ("+ordpoints[3].toString()+" - "+ordpoints[1].toString()+")" );
  // }
  // else {
  //   console.log([lambdax,lambday]);
  // }

  if (set) {

    drawX(lambdax,lambday);
    ctx.font="10px Georgia";
    ctx.fillText((waveln/angstroms_per_micron).toString()+" \u00B5",lambdax,lambday-8);

    if(lambdax > (ordpoints[0]+((ordpoints[2]-ordpoints[0])/2)) ) {
      drawX(lambdax-(ordpoints[2]-ordpoints[0]),lambday);
      ctx.fillText((waveln/angstroms_per_micron).toString()+" \u00B5",lambdax-(ordpoints[2]-ordpoints[0]),lambday-8);

    }
    else if ( (ordpoints[0]+((ordpoints[2]-ordpoints[0])/2))<(X_UPPER_LIMIT-10) ) {
      drawX(lambdax+(ordpoints[2]-ordpoints[0]),lambday);
      ctx.fillText((waveln/angstroms_per_micron).toString()+" \u00B5",lambdax+(ordpoints[2]-ordpoints[0]),lambday-8);

    }

    if (add) {
      plottedwavelengths.push(parseInt(waveln));
      console.log(plottedwavelengths);

    }

  }

  return [lambdax,lambday];

}

function drawX(posx,posy) {

  var size = 3;
  ctx.beginPath();
  ctx.strokeStyle=MARKER_COLOR;
  ctx.fillStyle=MARKER_COLOR;
  ctx.moveTo(posx-size,posy-size);
  ctx.lineTo(posx+size,posy+size);
  ctx.stroke();
  ctx.moveTo(posx-size,posy+size);
  ctx.lineTo(posx+size,posy-size);
  ctx.stroke();

}

function setDetectorPositionAngle() {

  var setecangle = parseFloat(document.getElementById("FindEchelleAngle").value);
  var setxdangle = parseFloat(document.getElementById("FindCrossDisperserAngle").value);

  document.getElementById("EchelleAngle").innerHTML = "Echelle Angle:<br>"+setecangle.toString()+String.fromCharCode(176);
  document.getElementById("CrossDisperserAngle").innerHTML = "Cross Disperser Angle:<br>"+setxdangle.toString()+String.fromCharCode(176);

  var xdanglelambda = Math.abs( Math.sin((setxdangle+xddeltad)*(Math.PI/180)) * ( 2.0 * angstroms_per_micron * xdsigma * Math.cos( (Math.PI/180) * (xdalfbet*0.5) ) ) );
  var centralorder = order[findLambdaOrderIndex(xdanglelambda)];
  var ecanglelambda = Math.abs( Math.sin((setecangle+ecdeltad)*(Math.PI/180)) * ( 2.0 * angstroms_per_micron * ecsigma * Math.cos( (Math.PI/180) * ecthetad ) ) / centralorder);

  var lambdalocation = findLambdaLocation(ecanglelambda,false,false);

  document.getElementById("CentralOrder").innerHTML = "Central Order: "+centralorder.toString();
  document.getElementById("lambdainput").value = (ecanglelambda/angstroms_per_micron).toPrecision(PRECISION).toString();

  // console.log(ecanglelambda.toString()+": "+findLambdaLocation(ecanglelambda,false).toString());
  // console.log(xdanglelambda.toString()+": "+findLambdaLocation(xdanglelambda,false).toString());

  var detectordraggable = document.getElementById('detector');
  detectordraggable.style.left = (X_LOWER_LIMIT+lambdalocation[0]-detectordim[0]/2).toString() + 'px';
  detectordraggable.style.top = (Y_LOWER_LIMIT+lambdalocation[1]-detectordim[1]/2).toString() + 'px';

}


function setDetectorPositionWavelength() {
  // console.log("set");
  var setlambda = parseFloat(document.getElementById("lambdainput").value);
  var detcoords = findLambdaLocation(setlambda, false,false);
  var detectordraggable = document.getElementById('detector');
  detectordraggable.style.left = (detcoords[0]-detectordim[0]/2).toString() + 'px';
  detectordraggable.style.top = (detcoords[1]-detectordim[1]/2).toString() + 'px';

  ord = findOrderIndex(detcoords[0],detcoords[1]);

  ecangle = ((180/Math.PI)*(Math.asin( order[ord] * setlambda / ( 2.0 * angstroms_per_micron * ecsigma * Math.cos( (Math.PI/180)*ecthetad) ))) ).toPrecision(PRECISION);
  xdangle = ((180/Math.PI)*(Math.asin( setlambda / ( 2.0 * angstroms_per_micron * xdsigma * Math.cos( (Math.PI/180)*(xdalfbet*0.5) )))) ).toPrecision(PRECISION);
  document.getElementById("EchelleAngle").innerHTML = "Echelle Angle = "+ecangle.toString()+String.fromCharCode(176);
  document.getElementById("CrossDisperserAngle").innerHTML = "Cross Disperser Angle = "+xdangle.toString()+String.fromCharCode(176);

  if (document.getElementById("toggleDetector").value == "Show Detector") {
    detectorTog();
  }
}

(function () {
  // main: this has all of the event capture stuff.
  adjusted_x=0;
  adjusted_y=0;
  ord=1;

  function getMouse(e){
    var posx;
    var posy;

    if (!e) var e = window.event;

    if (e.pageX || e.pageY) {
      posx = e.pageX + document.getElementById("container").scrollLeft;
      posy = e.pageY + document.getElementById("container").scrollTop;
    }
    else if (e.clientX || e.clientY) {
      posx = e.clientX + document.getElementById("container").scrollLeft;
      posy = e.clientY + document.getElementById("container").scrollTop;
    }

    return [posx,posy];

  }

  document.onmousemove = handleMouseMove;
  function handleMouseMove(e) {
    var eventDoc, doc, body, pageX, pageY;

    // event = event || window.event; //makes stuff work in IE

    // if (event.pageX == null && event.clientX != null) {
    //     eventDoc = (event.target && event.target.ownerDocument) || document;
    //     doc = eventDoc.documentElement;
    //     body = eventDoc.body;

    //     event.pageX = event.clientX +
    //       (doc && doc.scrollLeft || body && body.scrollLeft || 0) -
    //       (doc && doc.clientLeft || body && body.clientLeft || 0);
    //     event.pageY = event.clientY +
    //       (doc && doc.scrollTop  || body && body.scrollTop  || 0) -
    //       (doc && doc.clientTop  || body && body.clientTop  || 0 );
    //   }

    var posx;
    var posy;

    if (!e) var e = window.event;

    if (e.pageX || e.pageY) {
      posx = e.pageX + document.getElementById("container").scrollLeft - X_LOWER_LIMIT;
      posy = e.pageY + document.getElementById("container").scrollTop - Y_LOWER_LIMIT;

      // console.log("("+posx.toString()+","+posy.toString()+")");
    }
    else if (e.clientX || e.clientY) {
      posx = e.clientX + document.getElementById("container").scrollLeft - X_LOWER_LIMIT;
      posy = e.clientY + document.getElementById("container").scrollTop - Y_LOWER_LIMIT;
    }

    adjusted_x = posx;
    adjusted_y = posy;
    // <span id="Coords" class="data">Cursor location</span>
    // document.getElementById("Coords").innerHTML = "Cursor location: ("+adjusted_x.toString()+", "+adjusted_y.toString()+")";
    

    if (posx < X_UPPER_LIMIT && posy < Y_UPPER_LIMIT) {
      ord = findOrderIndex(adjusted_x,adjusted_y);
      document.getElementById("OrderNum").innerHTML = "Order: "+order[ord].toString();
      // console.log(ord);
      minx = endpoints[ord][0];
      maxx = endpoints[ord][2];

      if (adjusted_x < minx) adjusted_x = minx;
      if (adjusted_x > maxx) adjusted_x = maxx;

      lambda = (findLambda(ord,adjusted_x,adjusted_y)).toPrecision(PRECISION);
      document.getElementById("Wavelength").innerHTML = "Lambda = "+(lambda/angstroms_per_micron).toPrecision(PRECISION).toString()+" \u00B5";

      if(drag) {
        var detectordraggable = document.getElementById('detector');
        var detectorposition = [Math.round(e.pageX - xdragoffset - detectordim[0]/2),Math.round(e.pageY- ydragoffset - detectordim[1]/2)];
        detectordraggable.style.left = detectorposition[0].toString() + 'px';
        detectordraggable.style.top = detectorposition[1].toString() + 'px';

        detectorposition_adjusted = [detectorposition[0]+document.getElementById("container").scrollLeft-X_LOWER_LIMIT+detectordim[0]/2,detectorposition[1]+document.getElementById("container").scrollTop-Y_LOWER_LIMIT+detectordim[1]/2]

        var detord = findOrderIndex(detectorposition_adjusted[0],detectorposition_adjusted[1]);
        var detlambda = findLambda(detord,detectorposition[0]+Math.round(detectordim[0]/2),detectorposition[1]+Math.round(detectordim[1]/2));

        document.getElementById("lambdainput").value = (detlambda/angstroms_per_micron).toPrecision(PRECISION).toString();

        ecangle = ((180/Math.PI)*(Math.asin( order[detord] * detlambda / ( 2.0 * angstroms_per_micron * ecsigma * Math.cos( (Math.PI/180)*ecthetad) ))) ).toPrecision(PRECISION);
        xdangle = ((180/Math.PI)*(Math.asin( detlambda / ( 2.0 * angstroms_per_micron * xdsigma * Math.cos( (Math.PI/180)*(xdalfbet*0.5) )))) ).toPrecision(PRECISION);
        document.getElementById("EchelleAngle").innerHTML = "Echelle Angle:<br>"+ecangle.toString()+String.fromCharCode(176);
        document.getElementById("CrossDisperserAngle").innerHTML = "Cross Disperser Angle:<br>"+xdangle.toString()+String.fromCharCode(176);    
        document.getElementById("CentralOrder").innerHTML = "Central Order: "+order[detord].toString();
      }
    }
  }

  document.onclick = handleClick;

  function handleClick(e) {
    var eventDoc, doc, body, pageX, pageY;

    var posx;
    var posy;

    if (!e) var e = window.event;

    if (e.pageX || e.pageY) {
      posx = e.pageX + document.getElementById("container").scrollLeft - X_LOWER_LIMIT;
      posy = e.pageY + document.getElementById("container").scrollTop - Y_LOWER_LIMIT;
    }
    else if (e.clientX || e.clientY) {
      posx = e.clientX + document.getElementById("container").scrollLeft - X_LOWER_LIMIT;
      posy = e.clientY + document.getElementById("container").scrollTop - Y_LOWER_LIMIT;
    }

    if (!drag) {
      if (posx < X_UPPER_LIMIT && posy < Y_UPPER_LIMIT) {
        var filterN = parseInt(filter.replace(/\D/g,''));
        if(order[ord]>=50){
          url = "https://www.keck.hawaii.edu/realpublic/inst/nirspec/images/"+filter+"order"+order[ord].toString()+".pdf";
        }

        else if(order[ord]>=34){
          if(posx<ecwidth/2) var section = "a";
          else var section = 'b';

          if(filter==="N5") url = "https://www.keck.hawaii.edu/realpublic/inst/nirspec/images/N5order"+order[ord].toString()+section+".pdf";
          else if (filter==="N6") url = "https://www.keck.hawaii.edu/realpublic/inst/nirspec/images/n6-ord"+order[ord].toString()+section+".pdf";
        }

        else {
          if(posx<ecwidth/3) var section = "a";
          else if(posx<ecwidth*2/3) var section = "b";
          else var section = "c";
          url = "https://www.keck.hawaii.edu/realpublic/inst/nirspec/images/"+filter+"order"+order[ord].toString()+section+".pdf";
        }


        spectrumgraph.src = url;
          
        // order"+order[ord].toString()+".gif";
        document.getElementById("popup").src = url;
      }
    }

  }

  document.onmouseup = handleMouseUp;

  function handleMouseUp(event) {
    drag=false;
  }

  spectrumgraph.onerror = function(){
    spectrumgraph.innerHTML = "Sorry, this order has not yet been analyzed for this filter.";
  }

})();

function clearMarkers() {
  plottedwavelengths = [];
  clear=true;
  update();
}

function Drag() {
  drag=true;
  var e = window.event;
  xdragoffset = Math.round( e.pageX /*+ document.getElementById("container").scrollLeft - X_LOWER_LIMIT)*/ - parseInt(document.getElementById("detector").style.left) - detectordim[0]/2);
  ydragoffset = Math.round(e.pageY /*+ document.getElementById("container").scrollTop - Y_LOWER_LIMIT)*/ - parseInt(document.getElementById("detector").style.top) - detectordim[1]/2);

  // console.log(xdragoffset.toString()+", "+ydragoffset.toString());

}

function update() {
    // console.log("updating echelle");
    ZOOM = parseFloat(document.getElementById("zoom").value)/2;
    ctx.beginPath();
    ctx.clearRect(0, 0, 1000, 2000);

    filter = document.getElementById("switchFilter").value;

    
    // color=something
    // console.log("drawing echelle, zoom="+ZOOM.toString());

    drawEchelle();


}

function detectorTog() {
  var detector = document.getElementById("detector");

  if (detector.style.display != "none" ) {
    detector.style.display = "none";
    document.getElementById("toggleDetector").value = "Show Detector";
  }
  else {
    detector.style.display = "block";
    document.getElementById("toggleDetector").value = "Hide Detector";
  }
}

function updateAllAngles() {
  setEchelleAngle(document.getElementById("FindEchelleAngle").value);
  setCrossDisperserAngle(document.getElementById("FindCrossDisperserAngle").value);
}


