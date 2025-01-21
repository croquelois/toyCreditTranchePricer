const c4onPi = 4/Math.PI;
const cAerf = 0.147;

function erfInv(x) {
  let ln = Math.log(1 - x * x);
  let first = 2 / (Math.PI * cAerf) + ln / 2;
  let second = ln * 1/cAerf;
  return Math.sign(x) * Math.sqrt(Math.sqrt(first * first - second) - first);
}

function erf(x) {
  let x2 = x*x;
  let ax2 = cAerf*x2;
  var ratio = -x2 * (c4onPi + ax2) / (1 + ax2);
  return Math.sign(x) * Math.sqrt(1-Math.exp(ratio));
}

/* test erfInv/erf
// did my inverse function work ?
for(let i=0;i<=20;i++){
  let x = -0.95 + i*(0.95 - (-0.95))/20;
  console.log(x, erfInv(x), erf(erfInv(x)));
}
/**/

function uniform2normal(x){
  return erfInv(x*2-1);
}
function normal2uniform(x){
  return (1+erf(x))/2
}
function rnd(){ // normal distribution
  return uniform2normal(Math.random());
}

function generateCorrelatedNormals(corr, n, dim){
  let ret = [];
  let decomp = corr && cholesky(corr);
  while(n--){
    let w = Array.from({length: dim}, () => rnd());
    if(decomp)
      w = numeric.dot(decomp,w);
    ret.push(w);
  }
  return ret;
}

/* test default probability
// does it increase ? does it goes to 1 ?
// does it start at 0 ? does it stay between 0 and 1 ?
const h = 0.05;
for(let i=0;i<=20;i++){
  let t = i*5/20;
  console.log(t, 1 - Math.exp(-h * t));
}
console.log(1000, 1 - Math.exp(-h * 1000));
/**/

function simulatePortfolioLoss(hazardRates, T, correlations, n, dim) {
  let dfltProb = hazardRates.map(h => 1 - Math.pow(1-h, T));
  let correlatedRandoms = generateCorrelatedNormals(correlations, n, dim);
  return correlatedRandoms.map(sim => {
    return sim.filter((s,i) => normal2uniform(s) < dfltProb[i]).length / dim;
  });
}

function trancheLosses(losses, attachment, detachment) {
  return losses.map(loss => {
    if (loss <= attachment) return 0;
    if (loss >= detachment) return detachment - attachment;
    return loss - attachment;
  });
}

function premiumLeg(trancheLosses, spread, notional, discountFactor) {
  let expectedPayments = trancheLosses.reduce((sum, loss) => sum + (1 - loss), 0) / trancheLosses.length;
  return spread * notional * expectedPayments * discountFactor;
}

function protectionLeg(trancheLosses, notional, discountFactor) {
  let expectedLosses = trancheLosses.reduce((sum, loss) => sum + loss, 0) / trancheLosses.length;
  return expectedLosses * notional * discountFactor;
}

function solveTrancheSpread(attachment, detachment, losses, notional, discountFactor) {
  let lowerBound = 0;
  let upperBound = 10000;
  let tolerance = 1e-6;
  
  let trancheLossesArray = trancheLosses(losses, attachment, detachment);
  let protection = protectionLeg(trancheLossesArray, notional, discountFactor);
  while (upperBound - lowerBound > tolerance) {
    let mid = (lowerBound + upperBound) / 2;
    let premium = premiumLeg(trancheLossesArray, mid, notional, discountFactor);
    if (premium > protection) {
      upperBound = mid;
    } else {
      lowerBound = mid;
    }
  }
  return (lowerBound + upperBound) / 2;
}

function readMaturity(str){
  let v = +str.slice(0,-1);
  let u = str.slice(-1);
  if(u == "Y" || u == "y")
    return v;
  if(u == "M" || u == "m")
    return v/12;
  if(u == "D" || u == "d")
    return v/365;
  throw new Error(`Unrecognized maturity unit: ${u}`);
}

function readRate(str){
  if(!str)
    throw new Error(`Empty rate`);
  let v = +str.slice(0,-1);
  let u = str.slice(-1);
  if(u == "%")
    return v/100;
  throw new Error(`Unrecognized rate unit: ${u}`);
}

function readNotional(str){
  if(!str)
    throw new Error(`Empty notional`);
  let v = +str.slice(0,-1);
  let u = str.slice(-1);
  if(u == "M")
    return v*1000000;
  if(u == "k")
    return v*1000;
  if (u >= '0' && u <= '9')
    return +str;
  throw new Error(`Unrecognized notional unit: ${u}`);
}

function readListRate(str){
  if(!str)
    throw new Error(`Empty list of rates`);
  return str.split(",").map(s => s.trim()).map(readRate);
}

function readCorrelationMatrix(str){
  if(!str)
    throw new Error(`Empty correlation matrix`);
  return str.split("\n").map(readListRate);
}

function compute(){
  let hazardRates = readListRate(document.getElementById("hazardRates").value);
  let correlations = readCorrelationMatrix(document.getElementById("corrMatrix").value);
  let numSimulations = +document.getElementById("nbPaths").value;
  let attachment = readRate(document.getElementById("attachPt").value);
  let detachment = readRate(document.getElementById("detachPt").value);
  let notional = readNotional(document.getElementById("notional").value);
  let discountRate = readRate(document.getElementById("intRate").value);
  let timeHorizon = readMaturity(document.getElementById("maturity").value);

  let discountFactor = Math.exp(-discountRate*timeHorizon);
  let dim = hazardRates.length;
  let losses = simulatePortfolioLoss(hazardRates, timeHorizon, correlations, numSimulations, dim);
  let trancheLossesArray = trancheLosses(losses, attachment, detachment);
  let protection = protectionLeg(trancheLossesArray, notional, discountFactor);
  let spread = solveTrancheSpread(attachment, detachment, losses, notional, discountFactor);
  let premium = premiumLeg(trancheLossesArray, spread, notional, discountFactor);
  
  document.getElementById("spread").value = (10000*spread).toFixed(0) + "bps";
  document.getElementById("protection").value = protection.toFixed(2);
  document.getElementById("premium").value = premium.toFixed(2);
}