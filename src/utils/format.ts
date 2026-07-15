export const formatNumberWithSetting = (
  num: number,
  setting: string,
  appLocale?: string
): string => {
  if (setting === "us") {
    return num.toLocaleString("en-US");
  }
  if (setting === "eu") {
    return num.toLocaleString("de-DE");
  }
  if (setting === "fr") {
    return num.toLocaleString("fr-FR").replace(/\u202f/g, " ");
  }
  return num.toLocaleString(appLocale);
};

export const formatDateWithSetting = (
  dateObj: Date,
  setting: string,
  appLocale?: string
): string => {
  if (setting === "iso") {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (setting === "us") {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    return `${mm}/${dd}/${yyyy}`;
  }
  if (setting === "eu") {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }
  return dateObj.toLocaleDateString(appLocale);
};

export const formatTimeWithSetting = (
  dateObj: Date,
  timeFormat: string,
  showSeconds: boolean,
  appLocale?: string
): string => {
  const timeOptions: Intl.DateTimeFormatOptions = {
    timeStyle: showSeconds ? "medium" : "short",
  };
  if (timeFormat === "12") {
    timeOptions.hour12 = true;
  } else if (timeFormat === "24") {
    timeOptions.hour12 = false;
  }
  return dateObj.toLocaleTimeString(appLocale, timeOptions);
};
