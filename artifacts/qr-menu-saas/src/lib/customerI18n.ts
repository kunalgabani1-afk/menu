export type Language = "en" | "gu" | "hi";

export interface TranslationsDict {
  searchPlaceholder: string;
  allItems: string;
  pureVeg: string;
  jain: string;
  soldOut: string;
  add: string;
  viewOrder: string;
  items: string;
  item: string;
  table: string;
  orderAgain: string;
  clear: string;
  foundDishes: string;
  noDishesMatch: string;
  tryBrowsing: string;
  clearSearch: string;
  bestseller: string;
  chefsPick: string;
  vegetarian: string;
  nonVegetarian: string;
  jainPreparation: string;
  orderSummary: string;
  total: string;
  payment: string;
  payAtCounter: string;
  paid: string;
  backToMenu: string;
  reorderSuccess: string;
  soldOutCannotReorder: string;
  reordering: string;
  yourOrder: string;
  placeOrder: string;
  placingOrder: string;
  specialInstructions: string;
  specialInstructionsPlaceholder: string;
  mobileNumber: string;
  mobileNumberDesc: string;
  subtotal: string;
  payLaterDesc: string;
}

export const I18N_STRINGS: Record<Language, TranslationsDict> = {
  en: {
    searchPlaceholder: "Search dishes, descriptions, tags...",
    allItems: "All Items",
    pureVeg: "Pure Veg",
    jain: "Jain",
    soldOut: "Sold Out",
    add: "Add",
    viewOrder: "View Order",
    items: "items",
    item: "item",
    table: "Table",
    orderAgain: "🔁 Order Again",
    clear: "Clear",
    foundDishes: "dishes matching",
    noDishesMatch: "No dishes match your search or filter.",
    tryBrowsing: "Try switching filters or clearing your search.",
    clearSearch: "Clear filters & view all",
    bestseller: "🔥 Bestseller",
    chefsPick: "⭐ Chef's Pick",
    vegetarian: "Vegetarian",
    nonVegetarian: "Non-Vegetarian",
    jainPreparation: "Jain",
    orderSummary: "Order Summary",
    total: "Total",
    payment: "Payment",
    payAtCounter: "Pay at Counter",
    paid: "Paid",
    backToMenu: "Back to Menu",
    reorderSuccess: "Item reordered successfully!",
    soldOutCannotReorder: "Sold Out — cannot reorder",
    reordering: "Placing reorder...",
    yourOrder: "Your Table Order",
    placeOrder: "Confirm & Place Order",
    placingOrder: "Sending Order to Kitchen…",
    specialInstructions: "Kitchen Instructions (Optional)",
    specialInstructionsPlaceholder: "e.g. Less spicy, dressing on side, allergy alert...",
    mobileNumber: "Mobile Number",
    mobileNumberDesc: "For live order tracking & updates",
    subtotal: "Subtotal",
    payLaterDesc: "Your order will be freshly prepared. Pay with Cash or UPI at the counter when you finish.",
  },
  gu: {
    searchPlaceholder: "વાનગીઓ અથવા વિગતો શોધો...",
    allItems: "બધી વાનગીઓ",
    pureVeg: "શુદ્ધ શાકાહારી",
    jain: "જૈન",
    soldOut: "સોલ્ડ આઉટ",
    add: "ઉમેરો",
    viewOrder: "ઓર્ડર જુઓ",
    items: "વાનગીઓ",
    item: "વાનગી",
    table: "ટેબલ",
    orderAgain: "🔁 ફરી ઓર્ડર કરો",
    clear: "સાફ કરો",
    foundDishes: "વાનગીઓ મળી",
    noDishesMatch: "કોઈ મેળ ખાતી વાનગી નથી.",
    tryBrowsing: "ફિલ્ટર બદલીને અથવા સાફ કરીને ફરીથી જુઓ.",
    clearSearch: "બધી વાનગીઓ જુઓ",
    bestseller: "🔥 બેસ્ટસેલર",
    chefsPick: "⭐ શેફ પસંદગી",
    vegetarian: "શાકાહારી",
    nonVegetarian: "માંસાહારી",
    jainPreparation: "જૈન",
    orderSummary: "ઓર્ડર સારાંશ",
    total: "કુલ રકમ",
    payment: "ચુકવણી",
    payAtCounter: "કાઉન્ટર પર ચૂકવો",
    paid: "ચૂકવેલ",
    backToMenu: "મેનૂ પર પાછા જાઓ",
    reorderSuccess: "ફરી ઓર્ડર સફળતાપૂર્વક મૂકાયો!",
    soldOutCannotReorder: "સોલ્ડ આઉટ — ફરીથી ઓર્ડર શક્ય નથી",
    reordering: "ઓર્ડર થઈ રહ્યો છે...",
    yourOrder: "તમારો ટેબલ ઓર્ડર",
    placeOrder: "ઓર્ડર કન્ફર્મ કરો",
    placingOrder: "રસોડામાં ઓર્ડર મોકલી રહ્યા છીએ…",
    specialInstructions: "રસોડા માટે ખાસ સૂચના (વૈકલ્પિક)",
    specialInstructionsPlaceholder: "દા.ત. ઓછું તીખું, ડુંગળી વગર...",
    mobileNumber: "મોબાઈલ નંબર",
    mobileNumberDesc: "ઓર્ડર અપડેટ્સ માટે",
    subtotal: "સબટોટલ",
    payLaterDesc: "તમારો ઓર્ડર તાજો તૈયાર કરવામાં આવશે. જમ્યા પછી કાઉન્ટર પર રોકડ અથવા UPI દ્વારા ચૂકવો.",
  },
  hi: {
    searchPlaceholder: "व्यंजन, विवरण या टैग खोजें...",
    allItems: "सभी व्यंजन",
    pureVeg: "शुद्ध शाकाहारी",
    jain: "जैन",
    soldOut: "समाप्त",
    add: "जोड़ें",
    viewOrder: "ऑर्डर देखें",
    items: "व्यंजन",
    item: "व्यंजन",
    table: "टेबल",
    orderAgain: "🔁 फिर से ऑर्डर करें",
    clear: "हटाएं",
    foundDishes: "व्यंजन मिले",
    noDishesMatch: "कोई व्यंजन नहीं मिला।",
    tryBrowsing: "फ़िल्टर बदलें या खोज साफ़ करके देखें।",
    clearSearch: "सभी व्यंजन देखें",
    bestseller: "🔥 बेस्टसेलर",
    chefsPick: "⭐ शेफ्स पिक",
    vegetarian: "शाकाहारी",
    nonVegetarian: "मांसाहारी",
    jainPreparation: "जैन",
    orderSummary: "ऑर्डर सारांश",
    total: "कुल राशि",
    payment: "भुगतान",
    payAtCounter: "काउंटर पर भुगतान करें",
    paid: "भुगतान किया गया",
    backToMenu: "मेनू पर वापस जाएं",
    reorderSuccess: "फिर से ऑर्डर सफलतापूर्वक दर्ज हुआ!",
    soldOutCannotReorder: "समाप्त — पुनः ऑर्डर संभव नहीं",
    reordering: "ऑर्डर किया जा रहा है...",
    yourOrder: "आपका टेबल ऑर्डर",
    placeOrder: "ऑर्डर कन्फर्म करें",
    placingOrder: "रसोई को ऑर्डर भेजा जा रहा है…",
    specialInstructions: "रसोई के लिए विशेष निर्देश (वैकल्पिक)",
    specialInstructionsPlaceholder: "उदा. कम तीखा, प्याज के बिना...",
    mobileNumber: "मोबाइल नंबर",
    mobileNumberDesc: "ऑर्डर स्टेटस और अपडेट के लिए",
    subtotal: "सबटोटल",
    payLaterDesc: "आपका भोजन तुरंत तैयार किया जाएगा। भोजन के बाद काउंटर पर नकद या UPI द्वारा भुगतान करें।",
  },
};
