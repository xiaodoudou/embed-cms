// The calling codes of the countries (ITU E.164), for the phone field. Kept as a short text, `ISO:code`, that dialCodes() reads once.
// A territory that shares a code with its country has the area codes that tell it apart written after the code (`BS:1242`, `DO:1809/1829/1849`).
// Where countries share a code, the first one written is the one a number is taken for (+44 is the United Kingdom, +7 is Russia).
const TABLE = [
  'US:1', 'CA:1', 'GB:44', 'GG:44', 'JE:44', 'IM:44', 'RU:7', 'KZ:7', 'FI:358', 'AX:358', 'NO:47', 'SJ:47', 'AU:61', 'CC:61', 'CX:61', 'MA:212', 'EH:212', 'RE:262', 'YT:262',
  'GP:590', 'BL:590', 'MF:590', 'CW:599', 'BQ:599', 'IT:39', 'VA:39',
  'AD:376', 'AE:971', 'AF:93', 'AL:355', 'AM:374', 'AO:244', 'AR:54', 'AT:43', 'AW:297', 'AZ:994',
  'BA:387', 'BD:880', 'BE:32', 'BF:226', 'BG:359', 'BH:973', 'BI:257', 'BJ:229', 'BN:673', 'BO:591', 'BR:55', 'BT:975', 'BW:267', 'BY:375', 'BZ:501',
  'CD:243', 'CF:236', 'CG:242', 'CH:41', 'CI:225', 'CK:682', 'CL:56', 'CM:237', 'CN:86', 'CO:57', 'CR:506', 'CU:53', 'CV:238', 'CY:357', 'CZ:420',
  'DE:49', 'DJ:253', 'DK:45', 'DZ:213', 'EC:593', 'EE:372', 'EG:20', 'ER:291', 'ES:34', 'ET:251',
  'FJ:679', 'FK:500', 'FM:691', 'FO:298', 'FR:33', 'GA:241', 'GE:995', 'GF:594', 'GH:233', 'GI:350', 'GL:299', 'GM:220', 'GN:224', 'GQ:240', 'GR:30', 'GT:502', 'GW:245', 'GY:592',
  'HK:852', 'HN:504', 'HR:385', 'HT:509', 'HU:36', 'ID:62', 'IE:353', 'IL:972', 'IN:91', 'IO:246', 'IQ:964', 'IR:98', 'IS:354', 'JM:1876', 'JO:962', 'JP:81',
  'KE:254', 'KG:996', 'KH:855', 'KI:686', 'KM:269', 'KP:850', 'KR:82', 'KW:965', 'LA:856', 'LB:961', 'LI:423', 'LK:94', 'LR:231', 'LS:266', 'LT:370', 'LU:352', 'LV:371', 'LY:218',
  'MC:377', 'MD:373', 'ME:382', 'MG:261', 'MH:692', 'MK:389', 'ML:223', 'MM:95', 'MN:976', 'MO:853', 'MQ:596', 'MR:222', 'MT:356', 'MU:230', 'MV:960', 'MW:265', 'MX:52', 'MY:60', 'MZ:258',
  'NA:264', 'NC:687', 'NE:227', 'NF:672', 'NG:234', 'NI:505', 'NL:31', 'NP:977', 'NR:674', 'NU:683', 'NZ:64', 'OM:968',
  'PA:507', 'PE:51', 'PF:689', 'PG:675', 'PH:63', 'PK:92', 'PL:48', 'PM:508', 'PS:970', 'PT:351', 'PW:680', 'PY:595', 'QA:974',
  'RO:40', 'RS:381', 'RW:250', 'SA:966', 'SB:677', 'SC:248', 'SD:249', 'SE:46', 'SG:65', 'SH:290', 'SI:386', 'SK:421', 'SL:232', 'SM:378', 'SN:221', 'SO:252', 'SR:597', 'SS:211', 'ST:239', 'SV:503', 'SY:963', 'SZ:268',
  'TD:235', 'TG:228', 'TH:66', 'TJ:992', 'TK:690', 'TL:670', 'TM:993', 'TN:216', 'TO:676', 'TR:90', 'TV:688', 'TW:886', 'TZ:255',
  'UA:380', 'UG:256', 'UY:598', 'UZ:998', 'VE:58', 'VN:84', 'VU:678', 'WF:681', 'WS:685', 'XK:383', 'YE:967', 'ZA:27', 'ZM:260', 'ZW:263',
  // the North American plan: a territory is told by its area code
  'AG:1268', 'AI:1264', 'AS:1684', 'BB:1246', 'BM:1441', 'BS:1242', 'DM:1767', 'DO:1809/1829/1849', 'GD:1473', 'GU:1671', 'KN:1869', 'KY:1345', 'LC:1758',
  'MP:1670', 'MS:1664', 'PR:1787/1939', 'SX:1721', 'TC:1649', 'TT:1868', 'VC:1784', 'VG:1284', 'VI:1340'
]

// the area codes of Canada, which has the code of the United States
const CANADA_AREA_CODES = '204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 403 416 418 431 437 438 450 468 474 506 514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905'.split(' ')

let cache

/**
 * @returns {Array<{iso: string, dial: string, prefixes: string[]}>} every country with its calling code (`dial`, the digits to write after the +, with the area code
 *   for a territory of the North American plan) and the prefixes of the numbers that belong to it
 */
export function dialCodes () {
  if (!cache) {
    cache = TABLE.map((entry) => {
      const [iso, codes] = entry.split(':')
      const prefixes = codes.split('/')
      return { iso, dial: prefixes[0], prefixes }
    })
  }
  return cache
}

/**
 * @param {string} digits the digits of an international number, without the +
 * @returns {{iso: string, dial: string}|undefined} the country the number belongs to: the longest calling code it starts with (a territory of the North American plan by
 *   its area code, Canada by its area codes, the United States for the rest of +1); nothing when it starts with no calling code
 */
export function countryOfDigits (digits) {
  let found
  for (const country of dialCodes()) {
    for (const prefix of country.prefixes) {
      if (digits.startsWith(prefix) && (!found || prefix.length > found.prefix.length)) {
        found = { iso: country.iso, dial: country.dial, prefix }
      }
    }
  }
  if (found && found.prefix === '1' && CANADA_AREA_CODES.includes(digits.slice(1, 4))) {
    return { iso: 'CA', dial: '1' }
  }
  return found && { iso: found.iso, dial: found.dial }
}
