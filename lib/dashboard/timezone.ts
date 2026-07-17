type LocalDate = {
  year: number;
  month: number;
  day: number;
};

export type ClinicDayRange = {
  localDate: string;
  startIso: string;
  endIso: string;
};

function localDateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    calendar: "iso8601",
    numberingSystem: "latn",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function getLocalDate(value: Date, formatter: Intl.DateTimeFormat): LocalDate {
  const parts = formatter.formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function localDateKey(value: LocalDate) {
  return value.year * 10_000 + value.month * 100 + value.day;
}

function nextLocalDate(value: LocalDate): LocalDate {
  const next = new Date(Date.UTC(value.year, value.month - 1, value.day + 1));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
}

function startOfLocalDate(value: LocalDate, timeZone: string, formatter: Intl.DateTimeFormat) {
  const targetKey = localDateKey(value);
  const approximateUtc = Date.UTC(value.year, value.month - 1, value.day);
  let low = approximateUtc - 36 * 60 * 60 * 1000;
  let high = approximateUtc + 36 * 60 * 60 * 1000;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const middleKey = localDateKey(getLocalDate(new Date(middle), formatter));

    if (middleKey < targetKey) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const result = new Date(low);

  if (localDateKey(getLocalDate(result, formatter)) !== targetKey) {
    throw new RangeError(`Unable to resolve local date in time zone: ${timeZone}`);
  }

  return result;
}

function formatLocalDate(value: LocalDate) {
  return `${value.year.toString().padStart(4, "0")}-${value.month.toString().padStart(2, "0")}-${value.day
    .toString()
    .padStart(2, "0")}`;
}

export function getClinicDayRange(timeZone: string, referenceDate = new Date()): ClinicDayRange {
  const formatter = localDateFormatter(timeZone);
  const localDate = getLocalDate(referenceDate, formatter);
  return getClinicDateRange(timeZone, formatLocalDate(localDate));
}

export function getClinicDateRange(timeZone: string, localDateValue: string): ClinicDayRange {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDateValue);

  if (!match) {
    throw new RangeError(`Invalid local date: ${localDateValue}`);
  }

  const localDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
  const validationDate = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));

  if (
    validationDate.getUTCFullYear() !== localDate.year ||
    validationDate.getUTCMonth() + 1 !== localDate.month ||
    validationDate.getUTCDate() !== localDate.day
  ) {
    throw new RangeError(`Invalid local date: ${localDateValue}`);
  }

  const formatter = localDateFormatter(timeZone);
  const followingDate = nextLocalDate(localDate);

  return {
    localDate: localDateValue,
    startIso: startOfLocalDate(localDate, timeZone, formatter).toISOString(),
    endIso: startOfLocalDate(followingDate, timeZone, formatter).toISOString()
  };
}

export function formatClinicTime(value: string, timeZone: string, locale = "es-MX") {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}
