const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ==============================
// Default storage data
// ==============================
// Sources:
// - USDA Food Safety and Inspection Service (FSIS)
// - FDA Food Storage Guidelines
// - University of Nebraska-Lincoln Food Storage Guide
// - National Center for Home Food Preservation
// 
// Storage Methods:
// 1. Refrigeration (32-40°F / 0-4°C)
// 2. Room Temperature (60-70°F / 15-21°C)
// 3. Cold Storage/Root Cellar (50-60°F / 10-15°C)
//
// Guidelines:
// - Always check for signs of spoilage before consuming
// - Rotate stock using FIFO (First In, First Out)
// - Monitor temperature of storage areas
// - Keep different types of produce separate
//
const DEFAULT_STORAGE_DATA = {
  // Fresh Fruits
  "Fresh_Apple": {
    "storage": "Refrigerate in crisper drawer at 32-40°F (0-4°C)",
    "shelf_life": 42, // 4-6 weeks in refrigerator
    "tips": "Store away from other fruits to prevent ripening. Optimal humidity 90-95%. Can be stored in perforated plastic bags.",
    "signs_of_spoilage": "Soft spots, mold, wrinkled skin, mushy texture",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Refrigerator",
        "duration": "4-6 weeks",
        "temperature": "32-40°F (0-4°C)",
        "humidity": "90-95%"
      },
      {
        "method": "Cold Storage/Cellar",
        "duration": "2-3 months",
        "temperature": "30-32°F (-1-0°C)",
        "humidity": "90%"
      },
      {
        "method": "Room Temperature",
        "duration": "5-7 days",
        "temperature": "60-70°F (15-21°C)",
        "humidity": "n/a"
      }
    ],
    "source": "USDA Food Storage Guidelines & University of Maine Cooperative Extension"
  },
  "Fresh_Banana": {
    "storage": "Store at room temperature until ripe, then optionally refrigerate",
    "shelf_life": 5, // 5-7 days at room temperature
    "tips": "Keep away from other fruits, wrap stem in plastic wrap to slow ripening. Separate bananas to prevent them from ripening too quickly.",
    "signs_of_spoilage": "Black spots, mushy texture, strong fermented odor, mold",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Room Temperature (Unripe)",
        "duration": "5-7 days",
        "temperature": "60-68°F (15-20°C)",
        "humidity": "40-50%",
        "notes": "Best for ripening"
      },
      {
        "method": "Refrigerator (Ripe)",
        "duration": "1-2 weeks",
        "temperature": "40°F (4°C)",
        "notes": "Skin will blacken but flesh stays fresh"
      },
      {
        "method": "Freezer (Peeled & Sliced)",
        "duration": "2-3 months",
        "temperature": "0°F (-18°C)",
        "notes": "Perfect for smoothies and baking"
      }
    ],
    "ripeness_guide": {
      "green": "Unripe, starchy",
      "yellow_green": "Slightly ripe, firm",
      "yellow": "Perfectly ripe, sweet",
      "spotted": "Very ripe, best for baking",
      "brown": "Over-ripe, very sweet"
    },
    "source": "UC Davis Postharvest Technology Center & Chiquita Banana Ripening Guide"
  },
  "Fresh_Orange": {
    "storage": "Cool room temperature or refrigerate",
    "shelf_life": 21, // Up to 3 weeks when properly stored
    "tips": "Store in mesh bag for air circulation, keep dry, check regularly",
    "signs_of_spoilage": "Soft spots, mold, spongy texture, fermented smell",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Room Temperature",
        "duration": "1-2 weeks",
        "temperature": "60-70°F (15-21°C)",
        "humidity": "50-60%",
        "notes": "Best for immediate use and maximum juice"
      },
      {
        "method": "Refrigerator",
        "duration": "3-4 weeks",
        "temperature": "38-40°F (3-4°C)",
        "humidity": "85-90%",
        "notes": "In mesh bag or crisper drawer"
      },
      {
        "method": "Freezing (Segments/Juice)",
        "duration": "10-12 months",
        "temperature": "0°F (-18°C)",
        "notes": "Remove membranes before freezing"
      }
    ],
    "selection_tips": {
      "weight": "Should feel heavy for size",
      "texture": "Firm, no soft spots",
      "color": "Deep, solid orange (some green ok)"
    },
    "quality_indicators": {
      "firmness": "Slightly springy when squeezed",
      "weight": "Heavier oranges have more juice",
      "skin": "Thin skin usually indicates more flesh"
    },
    "nutrition_preservation": "Vitamin C content remains stable under refrigeration",
    "source": "Florida Department of Citrus & UC Davis Postharvest Technology Center"
  },
  "Fresh_Manggo": {
    "storage": "Store at room temperature until ripe, then refrigerate",
    "shelf_life": 5, // 5-7 days when ripe
    "tips": "Store away from other fruits, ripen at room temperature, check daily",
    "signs_of_spoilage": "Excessive softness, black spots, fermented smell",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Room Temperature (Unripe)",
        "duration": "5-7 days",
        "temperature": "65-72°F (18-22°C)",
        "notes": "To ripen naturally"
      },
      {
        "method": "Refrigerator (Ripe)",
        "duration": "5-7 days",
        "temperature": "40°F (4°C)",
        "notes": "Once fully ripe"
      },
      {
        "method": "Freezer (Peeled & Cubed)",
        "duration": "6 months",
        "temperature": "0°F (-18°C)",
        "notes": "In airtight container with sugar syrup"
      }
    ],
    "ripeness_guide": {
      "unripe": "Firm, green",
      "ripening": "Slight give when pressed, yellow with red blush",
      "ripe": "Yields to gentle pressure, fragrant at stem end",
      "overripe": "Very soft, strong sweet smell"
    },
    "ripening_tips": {
      "speed_up": "Place in paper bag with banana or apple",
      "slow_down": "Refrigerate when ripe"
    },
    "cutting_guide": "Score flesh in grid pattern, turn inside out",
    "source": "National Mango Board & University of Hawaii Extension"
  },
  "Fresh_Strawberry": {
    "storage": "Refrigerate unwashed in breathable container",
    "shelf_life": 5, // 5-7 days when properly stored
    "tips": "Don't wash until ready to use, remove moldy berries immediately",
    "signs_of_spoilage": "Mold, mushy texture, dull color, leaking juice",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Refrigerator",
        "duration": "5-7 days",
        "temperature": "32-36°F (0-2°C)",
        "humidity": "90-95%",
        "notes": "Store in original container or paper-towel lined container"
      },
      {
        "method": "Room Temperature",
        "duration": "1-2 days",
        "temperature": "65-70°F (18-21°C)",
        "notes": "Only for immediate consumption"
      },
      {
        "method": "Freezer",
        "duration": "8-12 months",
        "temperature": "0°F (-18°C)",
        "notes": "Freeze individually on tray first, then bag"
      }
    ],
    "preparation_tips": {
      "washing": "Rinse briefly in cool water just before use",
      "hulling": "Remove stems after washing",
      "drying": "Pat dry gently with paper towels"
    },
    "selection_guide": {
      "best": "Bright red, green caps, no white/green areas",
      "avoid": "Seedy appearance, dull color, soft spots"
    },
    "preservation_methods": {
      "freezing": "Hull, freeze on tray, then bag",
      "jam": "Use within 3 days of purchase for best results",
      "dehydrating": "Slice uniformly for even drying"
    },
    "source": "California Strawberry Commission & North Carolina State Extension"
  },

  // Fresh Vegetables
  "Fresh_Potato": {
    "storage": "Store in cool, dark, dry place with good ventilation",
    "shelf_life": 90, // 2-3 months in proper storage
    "tips": "Keep away from onions and direct sunlight. Store in paper bags or cardboard boxes with ventilation holes.",
    "signs_of_spoilage": "Green spots (solanine), soft spots, sprouting, shriveling",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold or extensive sprouting",
    "storage_methods": [
      {
        "method": "Cold Storage/Cellar",
        "duration": "2-3 months",
        "temperature": "45-50°F (7-10°C)",
        "humidity": "85-90%"
      },
      {
        "method": "Pantry",
        "duration": "2-3 weeks",
        "temperature": "60-70°F (15-21°C)",
        "humidity": "60-70%"
      },
      {
        "method": "Do NOT Refrigerate",
        "note": "Cold temperatures convert starch to sugar, affecting taste and texture"
      }
    ],
    "source": "National Center for Home Food Preservation & Idaho Potato Commission"
  },
  "Fresh_Carrot": {
    "storage": "Refrigerate in high-humidity drawer with ventilation",
    "shelf_life": 28, // 4-5 weeks when properly stored
    "tips": "Remove green tops before storing, store in perforated plastic bag with slight moisture",
    "signs_of_spoilage": "Soft texture, white spots (white blush), black spots, mold",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Refrigerator Crisper",
        "duration": "4-5 weeks",
        "temperature": "32-40°F (0-4°C)",
        "humidity": "90-95%",
        "notes": "Store in perforated plastic bag with paper towel"
      },
      {
        "method": "Root Cellar/Cold Storage",
        "duration": "4-6 months",
        "temperature": "32-40°F (0-4°C)",
        "humidity": "90-95%",
        "notes": "Store in damp sand or sawdust"
      },
      {
        "method": "Freezer (Blanched)",
        "duration": "10-12 months",
        "temperature": "0°F (-18°C)",
        "notes": "Blanch for 3 minutes before freezing"
      }
    ],
    "preparation_tips": {
      "cleaning": "Scrub gently, don't peel if fresh",
      "trimming": "Remove tops leaving 1/2 inch stem",
      "blanching": "3 minutes in boiling water before freezing"
    },
    "revival_method": "Soak in ice water for 1 hour to restore crispness",
    "source": "UC Davis Vegetable Research & Information Center & National Center for Home Food Preservation"
  },
  "Fresh_Pepper": {
    "storage": "Refrigerate in crisper drawer with moderate humidity",
    "shelf_life": 14, // 2-3 weeks when properly stored
    "tips": "Keep dry, do not wash before storing, maintain good air circulation",
    "signs_of_spoilage": "Soft spots, wrinkled skin, discoloration, mold at stem",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Refrigerator Crisper",
        "duration": "2-3 weeks",
        "temperature": "40-45°F (4-7°C)",
        "humidity": "60-70%",
        "notes": "Store in perforated plastic bag"
      },
      {
        "method": "Room Temperature",
        "duration": "4-5 days",
        "temperature": "65-70°F (18-21°C)",
        "notes": "For immediate use only"
      },
      {
        "method": "Freezer (Raw)",
        "duration": "6-8 months",
        "temperature": "0°F (-18°C)",
        "notes": "Cut and remove seeds before freezing"
      }
    ],
    "preparation_tips": {
      "washing": "Wash just before use",
      "cutting": "Remove stem and seeds",
      "freezing": "Can be frozen without blanching"
    },
    "nutrient_retention": {
      "vitamin_c": "Highest when fresh or frozen quickly",
      "color": "Maintains best in dark storage"
    },
    "source": "Michigan State University Extension & UC Davis Vegetable Research Center"
  },
  "Fresh_Cucumber": {
    "storage": "Refrigerate in crisper drawer wrapped loosely",
    "shelf_life": 7, // 7-10 days when properly stored
    "tips": "Store away from ethylene-producing fruits (apples, bananas), keep dry until use",
    "signs_of_spoilage": "Soft spots, yellowing, sliminess, strong odor",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Refrigerator Crisper",
        "duration": "7-10 days",
        "temperature": "40°F (4°C)",
        "humidity": "95%",
        "notes": "Wrap in slightly damp paper towel and place in open plastic bag"
      },
      {
        "method": "Room Temperature",
        "duration": "2-3 days",
        "temperature": "55-65°F (13-18°C)",
        "notes": "Best for immediate use"
      },
      {
        "method": "Pickling",
        "duration": "3-4 months",
        "temperature": "35-40°F (2-4°C)",
        "notes": "Preserves through fermentation or vinegar brine"
      }
    ],
    "best_practices": {
      "washing": "Rinse just before use",
      "drying": "Keep dry during storage to prevent mold",
      "handling": "Handle gently to prevent bruising"
    },
    "revival_method": "Soak in ice water for 30 minutes to crisp",
    "source": "Cornell Cooperative Extension & PennState Extension"
  },
  "Fresh_Okra": {
    "storage": "Refrigerate in paper bag or ventilated container",
    "shelf_life": 4, // 3-5 days when properly stored
    "tips": "Do not wash before storing, keep pods dry, handle gently",
    "signs_of_spoilage": "Dark spots, sliminess, tough texture, browning",
    "status": "Fresh",
    "waste_disposal": "Compost if no mold present",
    "storage_methods": [
      {
        "method": "Refrigerator Crisper",
        "duration": "3-5 days",
        "temperature": "40-45°F (4-7°C)",
        "humidity": "90-95%",
        "notes": "Store in paper bag with small holes"
      },
      {
        "method": "Room Temperature",
        "duration": "1-2 days",
        "temperature": "65-70°F (18-21°C)",
        "notes": "Use quickly for best quality"
      },
      {
        "method": "Freezer (Blanched)",
        "duration": "10-12 months",
        "temperature": "0°F (-18°C)",
        "notes": "Blanch whole pods 3-4 minutes"
      }
    ],
    "preparation_tips": {
      "selection": "Choose bright green, firm pods 2-4 inches long",
      "washing": "Rinse just before use",
      "cutting": "Cut stem end just before cooking",
      "blanching": "3-4 minutes for freezing"
    },
    "quality_indicators": {
      "best": "Bright green, firm, no blemishes",
      "good": "Slight bending, minimal spots",
      "discard": "Brown, slimy, or very soft"
    },
    "source": "University of Georgia Extension & Alabama Cooperative Extension"
  },

  // Fresh Meats
  "Fresh_Beef": {
    "storage": "Refrigerate at 32-40°F (0-4°C) or freeze immediately",
    "shelf_life": 3, // 3-5 days in refrigerator for ground beef, 3-7 days for cuts
    "tips": "Store on bottom shelf to prevent cross-contamination. Keep in original packaging or wrap tightly.",
    "signs_of_spoilage": "Gray/brown color, slimy texture, strong odor, sticky feel",
    "status": "Fresh",
    "waste_disposal": "Wrap securely and dispose in outdoor trash immediately",
    "storage_methods": [
      {
        "method": "Refrigerator (Ground)",
        "duration": "1-2 days",
        "temperature": "32-40°F (0-4°C)",
        "notes": "Use or freeze within 2 days of purchase"
      },
      {
        "method": "Refrigerator (Steaks/Roasts)",
        "duration": "3-5 days",
        "temperature": "32-40°F (0-4°C)",
        "notes": "Keep in original packaging or wrap tightly"
      },
      {
        "method": "Freezer (Ground)",
        "duration": "3-4 months",
        "temperature": "0°F (-18°C)",
        "notes": "Use freezer paper or vacuum seal"
      },
      {
        "method": "Freezer (Steaks/Roasts)",
        "duration": "6-12 months",
        "temperature": "0°F (-18°C)",
        "notes": "Vacuum seal for best results"
      }
    ],
    "defrosting_methods": {
      "recommended": "Thaw in refrigerator (24 hours per 4-5 pounds)",
      "quick": "Cold water bath (30 minutes per pound, change water every 30 minutes)",
      "not_recommended": "Never thaw at room temperature"
    },
    "source": "USDA Food Safety and Inspection Service (FSIS) & American Meat Science Association"
  },
  "Fresh_Chicken": {
    "storage": "Refrigerate at 32-40°F (0-4°C) or freeze",
    "shelf_life": 2, // 1-2 days in refrigerator
    "tips": "Store on bottom shelf in sealed container to prevent cross-contamination. Use or freeze within 2 days of purchase.",
    "signs_of_spoilage": "Gray/green color, slimy texture, strong odor, sticky/tacky feel",
    "status": "Fresh",
    "waste_disposal": "Wrap securely and dispose in outdoor trash",
    "storage_methods": [
      {
        "method": "Refrigerator",
        "duration": "1-2 days",
        "temperature": "32-40°F (0-4°C)",
        "notes": "Keep in original packaging or airtight container"
      },
      {
        "method": "Freezer",
        "duration": "9-12 months",
        "temperature": "0°F (-18°C)",
        "notes": "Wrap tightly in freezer paper or freezer bags"
      },
      {
        "method": "Cooked",
        "duration": "3-4 days refrigerated",
        "temperature": "32-40°F (0-4°C)",
        "notes": "Store in airtight container"
      }
    ],
    "source": "USDA Food Safety and Inspection Service (FSIS) & FDA Food Storage Guidelines"
  },
  "Fresh_Pork": {
    "storage": "Refrigerate at 32-40°F (0-4°C)",
    "shelf_life": 3,
    "tips": "Store on bottom shelf to prevent cross-contamination",
    "signs_of_spoilage": "Gray color, slimy texture, strong odor",
    "status": "Fresh",
    "waste_disposal": null
  },

  // Rotten Items
  "Rotten_Apple": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Mold, soft spots, wrinkled skin, strong odor",
    "status": "Rotten",
    "waste_disposal": "Compost if no mold, otherwise dispose in sealed bag in trash"
  },
  "Rotten_Banana": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Black spots, mushy texture, strong odor",
    "status": "Rotten",
    "waste_disposal": "Compost if no mold, otherwise dispose in sealed bag in trash"
  },
  "Rotten_Orange": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Mold, soft spots, dry texture, strong odor",
    "status": "Rotten",
    "waste_disposal": "Compost if no mold, otherwise dispose in sealed bag in trash"
  },
  "Rotten_Manggo": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Mold, soft spots, wrinkled skin, strong odor",
    "status": "Rotten",
    "waste_disposal": "Compost if no mold, otherwise dispose in sealed bag in trash"
  },
  "Rotten_Strawberry": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Mold, soft spots, wrinkled skin, strong odor",
    "status": "Rotten",
    "waste_disposal": "Compost if no mold, otherwise dispose in sealed bag in trash"
  },
  "Rotten_Beef": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Gray color, slimy texture, strong foul odor",
    "status": "Rotten",
    "waste_disposal": "Double-bag in plastic and dispose in trash. Do not compost meat products."
  },
  "Rotten_Chicken": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Gray color, slimy texture, strong foul odor",
    "status": "Rotten",
    "waste_disposal": "Double-bag in plastic and dispose in trash. Do not compost meat products."
  },
  "Rotten_Pork": {
    "storage": "DISPOSE IMMEDIATELY",
    "shelf_life": 0,
    "tips": "Do not consume - dispose safely",
    "signs_of_spoilage": "Gray color, slimy texture, strong foul odor",
    "status": "Rotten",
    "waste_disposal": "Double-bag in plastic and dispose in trash. Do not compost meat products."
  }
};

// ==============================
// StorageService Class
// ==============================
class StorageService {
  constructor() {
    const defaultPath = path.join(__dirname, '../data/storage_data.json');
    this.storageDataPath = process.env.STORAGE_PATH || defaultPath;
    this.storageData = this.loadStorageData();
  }

  loadStorageData() {
    try {
      if (fs.existsSync(this.storageDataPath)) {
        const data = fs.readFileSync(this.storageDataPath, 'utf8');
        return JSON.parse(data);
      } else {
        console.warn(`⚠️ Storage file not found. Creating new file at ${this.storageDataPath}`);
        const dir = path.dirname(this.storageDataPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.storageDataPath, JSON.stringify(DEFAULT_STORAGE_DATA, null, 2));
        return DEFAULT_STORAGE_DATA;
      }
    } catch (err) {
      console.error('❌ Error loading storage data:', err);
      return DEFAULT_STORAGE_DATA;
    }
  }

  normalizeLabel(label) {
    if (!label) return '';
    let formatted = label.trim();

    // Normalize prefixes
    if (formatted.toLowerCase().startsWith('fresh_'))
      formatted = 'Fresh_' + formatted.slice(6);
    else if (formatted.toLowerCase().startsWith('rotten_'))
      formatted = 'Rotten_' + formatted.slice(7);

    // Capitalize second word
    const parts = formatted.split('_');
    if (parts.length > 1) {
      parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
      formatted = parts.join('_');
    }

    return formatted;
  }

  getStorageData(itemName) {
    // If no itemName is provided, return the whole storage dataset
    if (itemName === undefined || itemName === null) {
      return this.storageData;
    }

    if (!itemName || typeof itemName !== 'string') {
      console.warn('⚠️ Invalid item name:', itemName);
      return null;
    }

    const normalized = this.normalizeLabel(itemName);

    if (this.storageData[normalized]) return this.storageData[normalized];

    for (const [key, value] of Object.entries(this.storageData)) {
      if (key.toLowerCase() === normalized.toLowerCase()) return value;
    }

    console.warn(`⚠️ No storage data found for "${itemName}"`);
    return null;
  }

  getAllStorageData() {
    return this.storageData;
  }
}

const storageService = new StorageService();

module.exports = {
  StorageService,
  getStorageData: (itemName) => storageService.getStorageData(itemName),
  storageService
};