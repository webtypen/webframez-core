class NumericFunctionsFacade {
  numberFormat(
    number: number,
    decimals?: number,
    dec_point?: string,
    thousands_sep?: string
  ) {
    if (decimals === undefined) {
      decimals = 2;
    }

    if (dec_point === undefined) {
      dec_point = ",";
    }

    if (thousands_sep === undefined) {
      thousands_sep = ".";
    }

    number = parseFloat((number + "").replace(/[^0-9+\-Ee.]/g, ""));
    let n = !isFinite(+number) ? 0 : +number,
      prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
      sep = typeof thousands_sep === "undefined" ? "," : thousands_sep,
      dec = typeof dec_point === "undefined" ? "." : dec_point,
      s = "",
      toFixedFix = function (n: number, prec: number) {
        var k = Math.pow(10, prec);
        return "" + Math.round(n * k) / k;
      };

    const sArr = (prec ? toFixedFix(n, prec) : "" + Math.round(n)).split(".");
    if (sArr[0].length > 3) {
      sArr[0] = sArr[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
    }
    if ((s[1] || "").length < prec) {
      sArr[1] = sArr[1] || "";
      sArr[1] += new Array(prec - sArr[1].length + 1).join("0");
    }
    return sArr.join(dec);
  }

  bytesFormat(bytes: number) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

    if (bytes == 0) {
      return "n/a";
    }

    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
    if (i == 0) {
      return bytes + " " + sizes[i];
    }
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
  }
}

export const NumericFunctions = new NumericFunctionsFacade();
