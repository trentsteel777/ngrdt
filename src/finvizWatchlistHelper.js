/*
    This script prints all optionable symbols in North America using finviz website.

    Open up the developer console in Google Chrome.
    GOTO: https://finviz.com/screener.ashx?v=111&f=sh_opt_option&ft=4&r=1
    GOTO sources tab in the developer console, and create a new snippet in the top left side section.
    Paste and save the code below, right click the file you have saved it in and select run.

    All the optionable symbols should be printed in the developer console and can be copied and pasted into your watchlist.
*/
function reqListener () {
    var pattern = /(screener-link-primary">)([^<\/a>]+)(<\/a>)/g;
    var match;    
  
    while (match = pattern.exec(this.responseText)) {
        console.log(match[2]);
    }
  }
  let start = 1
  let increment = 21
  let end = 4141
  for(let i = start; i <= end; i = i + 20) {
    var oReq = new XMLHttpRequest();
    oReq.addEventListener("load", reqListener);
    oReq.open("GET", "https://finviz.com/screener.ashx?v=111&f=sh_opt_option&ft=4&r=" + i);
    oReq.send();
  }
  