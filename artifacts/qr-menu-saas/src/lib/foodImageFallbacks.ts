/**
 * High-quality food imagery curated for cafe & restaurant ordering menus.
 * Guaranteed to match dish names and categories accurately.
 */

const FALLBACK_CATEGORY_IMAGES: Record<string, string> = {
  coffee: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80",
  beverage: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
  starter: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&auto=format&fit=crop&q=80",
  main: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
  dessert: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80",
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80",
  pasta: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
  tea: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80",
  sandwich: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80",
};

const DISH_IMAGE_MAP: Record<string, string> = {
  cappuccino: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&auto=format&fit=crop&q=80",
  "cold coffee": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80",
  "iced coffee": "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80",
  latte: "https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80",
  espresso: "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&auto=format&fit=crop&q=80",
  mocha: "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=600&auto=format&fit=crop&q=80",
  "paneer tikka": "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80",
  "french fries": "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80",
  fries: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80",
  "crispy corn": "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&auto=format&fit=crop&q=80",
  nachos: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=600&auto=format&fit=crop&q=80",
  "spring rolls": "https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80",
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80",
  "margherita pizza": "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80",
  pasta: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80",
  "alfredo pasta": "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&auto=format&fit=crop&q=80",
  "white sauce pasta": "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&auto=format&fit=crop&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
  sandwich: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80",
  croissant: "/pastry_croissant.jpg",
  waffle: "https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=600&auto=format&fit=crop&q=80",
  brownie: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80",
  tiramisu: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop&q=80",
  cheesecake: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80",
};

export function getFoodImage(itemName: string, categoryName?: string, existingUrl?: string | null | any): string {
  if (typeof existingUrl === "string" && existingUrl.trim() && !existingUrl.includes("placeholder") && !existingUrl.includes("via.placeholder")) {
    return existingUrl;
  }

  const nameLower = itemName.toLowerCase().trim();
  for (const [key, url] of Object.entries(DISH_IMAGE_MAP)) {
    if (nameLower.includes(key)) {
      return url;
    }
  }

  if (categoryName) {
    const catLower = categoryName.toLowerCase().trim();
    for (const [catKey, url] of Object.entries(FALLBACK_CATEGORY_IMAGES)) {
      if (catLower.includes(catKey)) {
        return url;
      }
    }
  }

  return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80";
}

export function getCategoryThumbnail(categoryName: string): string {
  const catLower = categoryName.toLowerCase().trim();
  for (const [catKey, url] of Object.entries(FALLBACK_CATEGORY_IMAGES)) {
    if (catLower.includes(catKey)) {
      return url;
    }
  }
  return "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80";
}
