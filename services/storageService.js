const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DEFAULT_STORAGE_DATA = {

// =============================================================================================================================
//                                                       Fresh Fruits
// =============================================================================================================================

  "Fresh_Apple": {
  "storage": "Refrigerate in crisper drawer at 32-40°F (0-4°C)",
  "shelf_life": 42,
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
  "storage": "Store at room temperature away from direct sunlight; refrigerate only when fully ripe",
  "shelf_life": 5,
  "tips": "Bananas ripen faster when stored near other fruits due to ethylene gas. Refrigeration darkens the peel but keeps the inside firm longer.",
  "signs_of_spoilage": "Large brown/black patches, leaking liquid, fermented smell, mushy texture",
  "status": "Fresh",
  "waste_disposal": "Compost peels; discard spoiled fruit in sealed bag",
  "storage_methods": [
    {
      "method": "Room Temperature",
      "duration": "2-5 days (unripe), 2-3 days (ripe)",
      "temperature": "60-70°F (15-21°C)",
      "humidity": "n/a"
    },
    {
      "method": "Refrigerator",
      "duration": "5-7 days (ripe only)",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer",
      "duration": "2-3 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA & University of Florida IFAS Extension"
},
  "Fresh_Orange": {
  "storage": "Refrigerate for longest freshness or keep at room temperature if consuming soon",
  "shelf_life": 21,
  "tips": "Avoid storing in sealed plastic bags; allow airflow. Keep away from moisture to prevent mold.",
  "signs_of_spoilage": "Soft spots, sour or fermented smell, mold (white/green/blue), leaking juice",
  "status": "Fresh",
  "waste_disposal": "Compost peels if clean; discard moldy oranges in sealed bag",
  "storage_methods": [
    {
      "method": "Refrigerator",
      "duration": "2-3 weeks",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "85-95%"
    },
    {
      "method": "Room Temperature",
      "duration": "5-7 days",
      "temperature": "60-70°F (15-21°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA & University of California Agriculture and Natural Resources"
},
  "Fresh_Manggo": {
  "storage": "Store at room temperature until ripe; refrigerate once ripe to extend freshness",
  "shelf_life": 7,
  "tips": "Keep unripe mangoes at room temperature. Once ripe, refrigerate to slow softening. Avoid stacking to prevent bruising.",
  "signs_of_spoilage": "Fermented or sour smell, excessive softness, leaking juice, dark moldy spots",
  "status": "Fresh",
  "waste_disposal": "Compost peels and seeds if no mold; discard moldy mangoes in sealed bag",
  "storage_methods": [
    {
      "method": "Room Temperature (Unripe)",
      "duration": "2-4 days",
      "temperature": "60-70°F (15-21°C)",
      "humidity": "n/a"
    },
    {
      "method": "Refrigerator (Ripe)",
      "duration": "3-5 days",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer (Cut Mango)",
      "duration": "10-12 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA & National Mango Board"
},
  "Fresh_Strawberry": {
  "storage": "Refrigerate immediately; keep dry and store unwashed in a breathable container.",
  "shelf_life": 3,
  "tips": "Do not wash until ready to eat. Remove any spoiled berries immediately to prevent spread of mold.",
  "signs_of_spoilage": "White/green mold, soft or mushy texture, leaking juice, fermented or sour smell",
  "status": "Fresh",
  "waste_disposal": "Compost if free of mold; if moldy, seal in bag and dispose in trash.",
  "storage_methods": [
    {
      "method": "Refrigerator",
      "duration": "2–3 days",
      "temperature": "32–36°F (0–2°C)",
      "humidity": "High humidity recommended"
    },
    {
      "method": "Freezer (Whole or Sliced)",
      "duration": "8–12 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    },
    {
      "method": "Paper-Towel Container Method",
      "duration": "4–7 days",
      "temperature": "Refrigerated",
      "humidity": "Moderate, moisture-controlled"
    }
  ],
  "source": "USDA & UC Agriculture and Natural Resources"
},

// =============================================================================================================================
//                                                       Fresh Vegetables
// =============================================================================================================================

  "Fresh_Potato": {
  "storage": "Store in a cool, dark, well-ventilated place; avoid refrigeration to prevent starch-to-sugar conversion.",
  "shelf_life": 30,
  "tips": "Keep potatoes away from onions to prevent faster spoilage. Remove sprouting potatoes immediately to slow deterioration.",
  "signs_of_spoilage": "Soft or mushy texture, large green patches, mold growth, foul or earthy rotten odor, excessive sprouting",
  "status": "Fresh",
  "waste_disposal": "Compost if not moldy; otherwise seal in a bag and dispose in regular trash.",
  "storage_methods": [
    {
      "method": "Pantry (Cool, Dark Area)",
      "duration": "3–6 weeks",
      "temperature": "45–55°F (7–13°C)",
      "humidity": "High humidity recommended"
    },
    {
      "method": "Refrigerator (Not Recommended)",
      "duration": "Not advised",
      "temperature": "32–40°F (0–4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Root Cellar",
      "duration": "2–3 months",
      "temperature": "40–50°F (4–10°C)",
      "humidity": "90–95%"
    }
  ],
  "source": "USDA & Produce Storage Guidelines"
},
  "Fresh_Carrot": {
  "storage": "Refrigerate in the crisper drawer at 32-40°F (0-4°C)",
  "shelf_life": 30,
  "tips": "Remove carrot tops to prevent moisture loss. Store in perforated plastic bags for optimal humidity.",
  "signs_of_spoilage": "Limp texture, white dryness on surface, sliminess, mold patches, foul odor",
  "status": "Fresh",
  "waste_disposal": "Compost if no mold; discard moldy or slimy carrots in sealed bag",
  "storage_methods": [
    {
      "method": "Refrigerator",
      "duration": "3-4 weeks",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "90-95%"
    },
    {
      "method": "Root Cellar",
      "duration": "2-4 months",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "95%"
    },
    {
      "method": "Room Temperature",
      "duration": "3-5 days",
      "temperature": "60-70°F (15-21°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA & University of Nebraska-Lincoln Extension"
},
  "Fresh_Pepper": {
  "storage": "Refrigerate in the crisper drawer; keep dry and unwashed until use",
  "shelf_life": 10,
  "tips": "Store in a breathable bag. Bell peppers last longer than thin-walled peppers. Moisture speeds spoilage.",
  "signs_of_spoilage": "Wrinkled skin, soft or sunken spots, mold near stem, sour odor",
  "status": "Fresh",
  "waste_disposal": "Compost if not moldy; discard moldy peppers in sealed bag",
  "storage_methods": [
    {
      "method": "Refrigerator",
      "duration": "1-2 weeks",
      "temperature": "45-50°F (7-10°C)",
      "humidity": "90-95%"
    },
    {
      "method": "Room Temperature",
      "duration": "2-3 days",
      "temperature": "60-70°F (15-21°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer (Chopped)",
      "duration": "10-12 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA & University of Minnesota Extension"
},
  "Fresh_Cucumber": {
  "storage": "Refrigerate in the crisper drawer; keep dry to prevent mold",
  "shelf_life": 7,
  "tips": "Do not store near ethylene-producing fruits (apples, bananas). Wrap in paper towel and place in a loose plastic bag for longest freshness.",
  "signs_of_spoilage": "Soft spots, shriveling, sliminess, leaking moisture, mold growth",
  "status": "Fresh",
  "waste_disposal": "Compost if not moldy; discard moldy or slimy cucumbers in sealed bag",
  "storage_methods": [
    {
      "method": "Refrigerator",
      "duration": "5-7 days",
      "temperature": "45-50°F (7-10°C)",
      "humidity": "90-95%"
    },
    {
      "method": "Room Temperature",
      "duration": "1-2 days",
      "temperature": "60-70°F (15-21°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA & Virginia Cooperative Extension"
},
  "Fresh_Okra": {
  "storage": "Refrigerate in a breathable bag; avoid moisture to prevent sliminess",
  "shelf_life": 4,
  "tips": "Keep okra dry—moisture speeds spoilage. Do not wash before storing. Use within a few days for best texture.",
  "signs_of_spoilage": "Dark spots, limp or soft pods, slimy texture, mold on stems",
  "status": "Fresh",
  "waste_disposal": "Compost if no mold; discard moldy or slimy okra in sealed bag",
  "storage_methods": [
    {
      "method": "Refrigerator",
      "duration": "2-4 days",
      "temperature": "45-50°F (7-10°C)",
      "humidity": "90-95%"
    },
    {
      "method": "Room Temperature",
      "duration": "1 day max",
      "temperature": "60-70°F (15-21°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer (Blanched)",
      "duration": "8-12 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA & University of Georgia Extension (National Center for Home Food Preservation)"
},

// =============================================================================================================================
//                                                       Fresh Meats
// =============================================================================================================================  

  "Fresh_Beef": {
  "storage": "Refrigerate at 32-40°F (0-4°C) or freeze immediately",
  "shelf_life": 5,
  "tips": "Store on the lowest refrigerator shelf to avoid cross-contamination. Keep in original packaging or rewrap tightly.",
  "signs_of_spoilage": "Gray-brown color, slimy texture, sticky surface, sour or ammonia-like odor",
  "status": "Fresh",
  "waste_disposal": "Seal and discard immediately; do not compost raw meat",
  "storage_methods": [
    {
      "method": "Refrigerator (Ground Beef)",
      "duration": "1-2 days",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Refrigerator (Steaks/Roasts)",
      "duration": "3-5 days",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer (Ground Beef)",
      "duration": "3-4 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer (Steaks/Roasts)",
      "duration": "6-12 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA Food Safety and Inspection Service (FSIS)"
},
  "Fresh_Chicken": {
  "storage": "Refrigerate at 32-40°F (0-4°C) or freeze immediately after purchase",
  "shelf_life": 2,
  "tips": "Keep chicken in its original packaging and place it on the bottom shelf to prevent cross-contamination. Handle with clean hands and sanitize surfaces.",
  "signs_of_spoilage": "Slimy texture, sour or sulfur-like odor, grayish color, sticky surface",
  "status": "Fresh",
  "waste_disposal": "Seal raw chicken waste in a bag and discard immediately; never compost raw poultry",
  "storage_methods": [
    {
      "method": "Refrigerator (Whole Chicken)",
      "duration": "1-2 days",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Refrigerator (Cut Chicken)",
      "duration": "1-2 days",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer (Whole Chicken)",
      "duration": "12 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer (Chicken Parts)",
      "duration": "9 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA Food Safety and Inspection Service (FSIS)"
},
"Fresh_Pork": {
  "storage": "Refrigerate immediately; keep in original packaging or airtight container",
  "shelf_life": 3,
  "tips": "Keep raw pork on the lowest refrigerator shelf to avoid cross-contamination. Freeze if not using within 3 days.",
  "signs_of_spoilage": "Slimy surface, gray/green discoloration, sour or ammonia-like odor",
  "status": "Fresh",
  "waste_disposal": "Seal tightly and dispose in trash; avoid composting raw meat",
  "storage_methods": [
    {
      "method": "Refrigerator",
      "duration": "2-3 days",
      "temperature": "32-40°F (0-4°C)",
      "humidity": "n/a"
    },
    {
      "method": "Freezer",
      "duration": "4-12 months",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    },
    {
      "method": "Vacuum-Sealed Freezer",
      "duration": "1-2 years",
      "temperature": "0°F (-18°C)",
      "humidity": "n/a"
    }
  ],
  "source": "USDA Food Safety & Inspection Service"
},

// =============================================================================================================================
//                                                      Rotten Fruits
// =============================================================================================================================

  "Rotten_Apple": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Rotten apples release ethylene gas, accelerating spoilage of nearby produce. Keep away from other food.",
  "signs_of_spoilage": "Brown/black soft spots, fermented smell, leaking juices, mold growth, wrinkled collapsed skin",
  "status": "Rotten",
  "waste_disposal": "Compost only if no mold is present; if moldy, seal in a bag and dispose in trash.",
  "storage_methods": [],
  "source": "USDA & University of Maine Cooperative Extension"
},
  "Rotten_Banana": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Rotten bananas attract fruit flies and can contaminate nearby produce. Handle carefully to avoid leaks.",
  "signs_of_spoilage": "Black mushy peel, leaking liquid, fermented or alcohol-like smell, visible mold, slimy texture",
  "status": "Rotten",
  "waste_disposal": "Do not compost moldy bananas. Seal in a plastic bag and dispose in trash.",
  "storage_methods": [],
  "source": "USDA & University of California Agriculture and Natural Resources"
},
  "Rotten_Orange": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Citrus fruits with mold can spread spores quickly. Even small mold spots indicate internal spoilage.",
  "signs_of_spoilage": "Soft or sunken areas, white/green/blue mold, fermented smell, leaking juice, bitter or off odor",
  "status": "Rotten",
  "waste_disposal": "Do not compost moldy citrus; seal in a plastic bag and discard in trash.",
  "storage_methods": [],
  "source": "USDA & Clemson Cooperative Extension"
},
  "Rotten_Manggo": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Mangoes spoil quickly once bruised. Rotten mangoes release liquid and attract insects.",
  "signs_of_spoilage": "Fermented or alcoholic smell, leaking juice, brown/black soft areas, mold growth, wrinkled skin",
  "status": "Rotten",
  "waste_disposal": "Compost only if there is no mold. If moldy, seal in a bag and dispose in trash.",
  "storage_methods": [],
  "source": "USDA & National Center for Home Food Preservation"
},
  "Rotten_Strawberry": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Strawberries spoil extremely fast. One moldy berry can spread contamination throughout the entire container.",
  "signs_of_spoilage": "White or green mold, mushy or collapsing texture, dark wet spots, fermented or sour odor",
  "status": "Rotten",
  "waste_disposal": "Do NOT compost moldy berries. Seal in a bag and dispose in household trash.",
  "storage_methods": [],
  "source": "USDA & UC Agriculture and Natural Resources"
},

// =============================================================================================================================
//                                                       Rotten Vegetables
// =============================================================================================================================

  "Rotten_Carrot": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Spoiled carrots can develop mold and a slimy texture. Separate from other vegetables to avoid spreading contamination.",
  "signs_of_spoilage": "Slimy surface, mushy texture, dark or black spots, white mold growth, sour smell",
  "status": "Rotten",
  "waste_disposal": "Compost only if there is **no mold present**. If moldy, seal in a bag and place in trash.",
  "storage_methods": [],
  "source": "USDA & University of Minnesota Extension"
},
"Rotten_Cucumber": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Cucumbers spoil quickly once moisture builds up. Rot spreads fast to nearby vegetables.",
  "signs_of_spoilage": "Soft, watery texture; leaking liquid; yellowing; mold patches; sour smell",
  "status": "Rotten",
  "waste_disposal": "Compost only if there is no mold present. If moldy or leaking, seal in a bag and place in trash.",
  "storage_methods": [],
  "source": "USDA & University of Wisconsin Horticulture"
},
"Rotten_Okra": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Okra becomes slimy very quickly once it starts spoiling. Keep spoiled okra away from fresh produce.",
  "signs_of_spoilage": "Slimy coating, dark brown/black spots, mushy texture, sour or unpleasant odor, mold patches",
  "status": "Rotten",
  "waste_disposal": "Compost only if there is no mold present. If moldy, seal in a bag and place in trash.",
  "storage_methods": [],
  "source": "USDA & University of Florida IFAS Extension"
},
"Rotten_Pepper": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Peppers deteriorate quickly once soft spots appear. Mold spreads fast inside hollow vegetables.",
  "signs_of_spoilage": "Wrinkled or collapsing skin, soft watery areas, black spots, mold growth, sour or rotten odor",
  "status": "Rotten",
  "waste_disposal": "Compost only if there is no mold. If moldy, seal in a bag and discard in trash.",
  "storage_methods": [],
  "source": "USDA & Penn State Extension"
},
"Rotten_Potato": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Rotten potatoes release toxic solanine gas, which can cause headaches and nausea in enclosed spaces.",
  "signs_of_spoilage": "Soft/mushy texture, foul sulfur-like odor, green coloration, sprouting with decay, black mold",
  "status": "Rotten",
  "waste_disposal": "Seal in a bag and discard in trash immediately. Do NOT compost rotten or moldy potatoes.",
  "storage_methods": [],
  "source": "USDA & University of Idaho Extension"
},

// =============================================================================================================================
//                                                       Rotten Meats
// =============================================================================================================================

  "Rotten_Beef": {
  "storage": "Do not store; discard immediately.",
  "shelf_life": 0,
  "tips": "Rotten beef can harbor dangerous bacteria like Salmonella or E. coli. Avoid touching other foods with contaminated packaging.",
  "signs_of_spoilage": "Brown/green discoloration, sticky or slimy surface, strong sour or ammonia-like odor, mold patches",
  "status": "Rotten",
  "waste_disposal": "Double-bag before throwing into trash to prevent leaks and odors. Do not compost raw or spoiled meat.",
  "storage_methods": [],
  "source": "USDA Food Safety & Inspection Service"
},
  "Rotten_Chicken": {
  "storage": "Do not store; discard immediately to prevent bacterial contamination.",
  "shelf_life": 0,
  "tips": "Raw chicken spoils rapidly. Even slight off-odors or sliminess indicate bacterial growth such as Salmonella or Campylobacter.",
  "signs_of_spoilage": "Sour or sulfur-like odor, sticky or slimy surface, gray/green discoloration, tacky texture",
  "status": "Rotten",
  "waste_disposal": "Seal securely in bags and dispose in an outdoor trash bin. Never compost rotten meat.",
  "storage_methods": [],
  "source": "USDA Food Safety & Inspection Service"
},
"Rotten_Pork": {
  "storage": "Do not store; discard immediately to prevent bacterial contamination.",
  "shelf_life": 0,
  "tips": "Rotten pork can harbor harmful bacteria like Salmonella, Listeria, and E. coli. Even slight odor changes indicate spoilage.",
  "signs_of_spoilage": "Sour or ammonia-like smell, sticky or slimy texture, gray/green discoloration, tacky surface",
  "status": "Rotten",
  "waste_disposal": "Seal tightly in double bags and dispose in an outdoor trash bin. Never compost rotten meat.",
  "storage_methods": [],
  "source": "USDA Food Safety & Inspection Service"
}
};


// =============================================================================================================================
//                                                       StorageService Class
// =============================================================================================================================
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

    if (formatted.toLowerCase().startsWith('fresh_'))
      formatted = 'Fresh_' + formatted.slice(6);
    else if (formatted.toLowerCase().startsWith('rotten_'))
      formatted = 'Rotten_' + formatted.slice(7);

    const parts = formatted.split('_');
    if (parts.length > 1) {
      parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
      formatted = parts.join('_');
    }

    return formatted;
  }

  getStorageData(itemName) {
    if (itemName === undefined || itemName === null) {
      return this.storageData;
    }

    if (!itemName || typeof itemName !== 'string') {
      console.warn('⚠️ Invalid item name:', itemName);
      return null;
    }

    const normalized = this.normalizeLabel(itemName);

    let entry = null;
    if (this.storageData[normalized]) {
      entry = this.storageData[normalized];
    } else {
      for (const [key, value] of Object.entries(this.storageData)) {
        if (key.toLowerCase() === normalized.toLowerCase()) {
          entry = value;
          break;
        }
      }
    }

    if (entry) {
      const defaultEntry = DEFAULT_STORAGE_DATA[normalized] || {};
      return {
        ...defaultEntry,
        ...entry,
        storage_methods: entry.storage_methods ?? defaultEntry.storage_methods ?? [],
        ripeness_guide: entry.ripeness_guide ?? defaultEntry.ripeness_guide ?? {},
        preparation_tips: entry.preparation_tips ?? defaultEntry.preparation_tips ?? {},
        source: entry.source ?? defaultEntry.source ?? 'Unknown',
      };
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