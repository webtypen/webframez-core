class StringFunctionsFacade {
  slug(string: string) {
    string = (string + "").toLowerCase();
    string = string.replace(new RegExp("  ", "g"), " ");
    string = string.replace(new RegExp("  ", "g"), " ");
    string = string.replace(new RegExp(" ", "g"), "-");
    string = string.replace(new RegExp("_", "g"), "-");

    const replacements: { [key: string]: string } = {
      Ä: "AE",
      ä: "ae",
      Ö: "OE",
      ö: "oe",
      Ü: "UE",
      ü: "ue",
      Đ: "D",
      đ: "d",
      "&": "and",
      "€": "euro",
      "<": "less",
      ">": "greater",
    };
    for (let i in replacements) {
      string = string.replace(new RegExp(i, "g"), replacements[i]);
    }

    return string.replace(/[^a-zA-Z\- ]/g, "").trim();
  }

  random(length: number) {
    const result = [];
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < length; i++) {
      result.push(chars.charAt(Math.floor(Math.random() * chars.length)));
    }
    return result.join("");
  }

  nl2br(str: string, replaceMode?: boolean, isXhtml?: boolean) {
    const breakTag = isXhtml ? "<br />" : "<br>";
    const replaceStr = replaceMode ? "$1" + breakTag : "$1" + breakTag + "$2";
    return (str + "").replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, replaceStr);
  }
}

export const StringFunctions = new StringFunctionsFacade();
