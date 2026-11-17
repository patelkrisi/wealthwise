// Reference data: default categories, Indian merchant/keyword dictionary, badges, challenges, rewards.

export const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', emoji: '🍽️', colour: '#f97316', bucket: 'want' },
  { name: 'Groceries', emoji: '🛒', colour: '#16a34a', bucket: 'need' },
  { name: 'Transport', emoji: '🛺', colour: '#0284c7', bucket: 'need' },
  { name: 'Travel', emoji: '✈️', colour: '#4f46e5', bucket: 'want' },
  { name: 'Shopping', emoji: '🛍️', colour: '#db2777', bucket: 'want' },
  { name: 'Bills & Utilities', emoji: '💡', colour: '#ca8a04', bucket: 'need' },
  { name: 'Rent & Housing', emoji: '🏠', colour: '#7c3aed', bucket: 'need' },
  { name: 'Entertainment & Subscriptions', emoji: '🎬', colour: '#9333ea', bucket: 'want' },
  { name: 'Health & Medical', emoji: '💊', colour: '#dc2626', bucket: 'need' },
  { name: 'Education', emoji: '📚', colour: '#2563eb', bucket: 'need' },
  { name: 'Personal Care', emoji: '💇', colour: '#0d9488', bucket: 'want' },
  { name: 'Gifts & Festivals', emoji: '🪔', colour: '#d97706', bucket: 'want' },
  { name: 'EMI & Loans', emoji: '🏦', colour: '#475569', bucket: 'need' },
  { name: 'Investments & Savings', emoji: '📈', colour: '#059669', bucket: 'save' },
  { name: 'Others', emoji: '📦', colour: '#94a3b8', bucket: 'want' },
] as const;

export type DefaultCategoryName = (typeof DEFAULT_CATEGORIES)[number]['name'];

/** Global default necessity per category (used when nothing better is known). */
export const CATEGORY_DEFAULT_NECESSITY: Record<string, 'necessary' | 'neutral' | 'unnecessary'> = {
  'Food & Dining': 'neutral',
  Groceries: 'necessary',
  Transport: 'necessary',
  Travel: 'neutral',
  Shopping: 'neutral',
  'Bills & Utilities': 'necessary',
  'Rent & Housing': 'necessary',
  'Entertainment & Subscriptions': 'neutral',
  'Health & Medical': 'necessary',
  Education: 'necessary',
  'Personal Care': 'neutral',
  'Gifts & Festivals': 'neutral',
  'EMI & Loans': 'necessary',
  'Investments & Savings': 'necessary',
  Others: 'neutral',
};

// keyword lists per category. Suffix ":u" = unnecessary-leaning, ":n" = necessary, ":m" = neutral.
// Keywords are matched as whole words / prefixes against the lower-cased expense name.
const M: Record<string, string> = {
  'Food & Dining': `swiggy:u zomato:u dominos:u domino's:u pizza:u pizza hut:u kfc:u mcdonalds:u mcdonald's:u burger:u burger king:u subway:u
    starbucks:u ccd:u cafe coffee day:u third wave:u blue tokai:u chaayos:u chai point:u chai:m tea:m coffee:m samosa:m
    biryani:m behrouz:u faasos:u box8:u eatfit:m freshmenu:m haldiram:m haldirams:m bikanervala:m barbeque nation:u bbq:u
    restaurant:m dinner:m lunch:m breakfast:m snacks:m canteen:n mess:n tiffin:n dabba:n thali:m dosa:m idli:m vada pav:m pav bhaji:m
    momos:m maggi:m chaat:m pani puri:m golgappa:m juice:m lassi:m icecream:u ice cream:u baskin:u naturals:u kwality walls:u
    dessert:u cake:m bakery:m theobroma:u wow momo:m rolls:m shawarma:m kebab:m paratha:m chole bhature:m street food:m
    food:m zepto cafe:u swiggy instamart cafe:u eatsure:u magicpin:u dineout:u eazydiner:u party:u drinks:u beer:u bar:u pub:u
    wine:u alcohol:u hookah:u cocktail:u brunch:u buffet:u`,
  Groceries: `blinkit:n zepto:n bigbasket:n big basket:n instamart:n dmart:n d-mart:n reliance fresh:n jiomart:n more supermarket:n
    spencers:n star bazaar:n nature's basket:n natures basket:n milkbasket:n country delight:n milk:n doodh:n amul:n mother dairy:n
    kirana:n sabzi:n vegetables:n fruits:n atta:n rice:n dal:n oil:n eggs:n bread:n grocery:n groceries:n ration:n provisions:n
    supermarket:n hypermarket:n swiggy instamart:n flipkart minutes:n bb daily:n dunzo:n paneer:n curd:n dahi:n ghee:n sugar:n
    masala:n spices:n tomato:n onion:n pyaz:n aloo:n kirane:n`,
  Transport: `ola:n uber:n rapido:n auto:n rickshaw:n autorickshaw:n metro:n bus:n bmtc:n best bus:n dtc:n local train:n mumbai local:n
    petrol:n diesel:n fuel:n cng:n indian oil:n iocl:n hp petrol:n bharat petroleum:n bpcl:n shell:n parking:n toll:n fastag:n
    cab:n taxi:n meru:n blusmart:n yulu:n bounce:n vogo:n namma yatri:n bike service:n car service:n car wash:m puncture:n
    commute:n office cab:n e-rickshaw:n tuk tuk:n ferry:n`,
  Travel: `irctc:n train ticket:n railway:n makemytrip:m goibibo:m cleartrip:m yatra:m easemytrip:m ixigo:m redbus:m flight:m
    indigo:m air india:m vistara:m spicejet:m akasa:m airasia:m hotel:m oyo:m airbnb:m treebo:m fabhotels:m zostel:m
    trip:m vacation:u holiday:u goa:u manali:u resort:u hostel:m visa:m passport:n volvo bus:m sleeper bus:m outstation:m
    booking.com:m agoda:m tour:u travel:m luggage:m`,
  Shopping: `amazon:m flipkart:m myntra:u ajio:u meesho:u nykaa fashion:u tata cliq:u snapdeal:m croma:m reliance digital:m vijay sales:m
    decathlon:m ikea:m pepperfry:m urban ladder:m lifestyle:u westside:u pantaloons:u max fashion:u zara:u h&m:u uniqlo:u
    shoppers stop:u central:u fbb:u zudio:u trends:u bata:m nike:u adidas:u puma:u skechers:u clothes:u shoes:u sneakers:u
    shirt:m jeans:u kurta:m saree:m dress:u watch:u headphones:u earphones:u airpods:u boat:u phone:m mobile:m laptop:m
    gadget:u electronics:m furniture:m mall:u shopping:u lenskart:m titan:u tanishq:u jewellery:u kitchenware:m utensils:m`,
  'Bills & Utilities': `electricity:n bescom:n msedcl:n tata power:n adani electricity:n bses:n tneb:n kseb:n cesc:n power bill:n light bill:n
    jio:n airtel:n vi:n vodafone:n idea:n bsnl:n recharge:n mobile recharge:n postpaid:n prepaid:n broadband:n wifi:n internet:n
    act fibernet:n hathway:n excitel:n jiofiber:n airtel xstream:n dth:n tata play:n tatasky:n dish tv:n sun direct:n
    gas:n lpg:n cylinder:n indane:n hp gas:n bharat gas:n piped gas:n mahanagar gas:n igl:n water bill:n water:n
    maintenance:n society maintenance:n property tax:n bill:n`,
  'Rent & Housing': `rent:n house rent:n pg:n paying guest:n hostel fee:n flat rent:n room rent:n deposit:n brokerage:n nobroker:n
    housing:n nestaway:n stanza:n zolo:n colive:n maid:n bai:n cook:n house help:n plumber:n electrician:n carpenter:n
    urban company:m repair:n painting:m home repair:n pest control:n`,
  'Entertainment & Subscriptions': `netflix:u prime video:m amazon prime:m hotstar:u disney:u jiocinema:u jiohotstar:u sonyliv:u zee5:u
    spotify:m youtube premium:u apple music:u gaana:u wynk:u audible:u kindle unlimited:u apple tv:u
    bookmyshow:u pvr:u inox:u cinepolis:u movie:u movies:u cinema:u concert:u gaming:u steam:u playstation:u xbox:u
    dream11:u mpl:u game:u bowling:u smaaash:u timezone:u amusement:u wonderla:u imagica:u event:u standup:u comedy show:u
    subscription:m chatgpt:m claude:m icloud:m google one:m linkedin premium:u tinder:u bumble:u`,
  'Health & Medical': `apollo:n apollo pharmacy:n pharmeasy:n netmeds:n 1mg:n tata 1mg:n medplus:n medicine:n medicines:n dawai:n chemist:n
    pharmacy:n doctor:n clinic:n hospital:n consultation:n practo:n lab test:n blood test:n thyrocare:n dr lal:n diagnostic:n
    dentist:n dental:n eye checkup:n spectacles:n health insurance:n mediclaim:n physiotherapy:n vaccine:n gym:m cult.fit:m
    cultfit:m yoga:m fitness:m protein:m whey:u healthify:m`,
  Education: `school fees:n school fee:n college fees:n tuition:n coaching:n course:n udemy:m coursera:m unacademy:m byjus:m byju's:m
    physicswallah:m vedantu:m upgrad:m books:n book:m stationery:n notebook:n pen:n exam fee:n exam:n application fee:n
    gre:n ielts:n toefl:n cfa:n library:n workshop:m certification:m tution:n`,
  'Personal Care': `salon:m haircut:m hair cut:m barber:m parlour:m parlor:m spa:u massage:u facial:u manicure:u pedicure:u waxing:m
    nykaa:u purplle:u mamaearth:m sugar cosmetics:u lakme:u cosmetics:u makeup:u skincare:m shampoo:n soap:n toothpaste:n
    deodorant:m perfume:u grooming:m beardo:m bombay shaving:m sunscreen:m urban company salon:m`,
  'Gifts & Festivals': `gift:m gifts:m birthday gift:m wedding gift:m shagun:m diwali:m holi:m rakhi:m raksha bandhan:m eid:m christmas:m
    navratri:m durga puja:m ganesh:m ganpati:m pooja:m puja:m mandir:m temple:m donation:m daan:m charity:m crackers:u
    patakhe:u diya:m rangoli:m sweets:m mithai:m dry fruits:m festival:m onam:m pongal:m lohri:m karwa chauth:m dhanteras:m
    wedding:m shaadi:m sangeet:m anniversary:m ferns n petals:m fnp:m igp:m archies:m`,
  'EMI & Loans': `emi:n loan:n home loan:n car loan:n personal loan:n education loan:n credit card bill:n cc bill:n bajaj finserv:n
    bajaj emi:n hdfc emi:n icici emi:n sbi emi:n kreditbee:n slice:n lazypay:n simpl:n zestmoney:n navi:n moneyview:n
    no cost emi:n interest:n repayment:n`,
  'Investments & Savings': `sip:n mutual fund:n mf:n zerodha:n groww:n upstox:n kuvera:n coin:n paytm money:n angel one:n smallcase:n
    ppf:n epf:n nps:n fd:n fixed deposit:n rd:n recurring deposit:n stocks:n shares:n gold:n digital gold:n sgb:n
    lic:n insurance premium:n term insurance:n savings:n investment:n invest:n emergency fund:n`,
  Others: `atm:m withdrawal:m transfer:m misc:m miscellaneous:m courier:n dunzo delivery:m porter:m laundry:n dry clean:n ironing:n
    istri:n xerox:n printout:n photocopy:n tailor:m alteration:m pet:n vet:n dog food:n cat food:n fine:n penalty:n
    late fee:u bank charges:n stamp:n notary:n`,
};

export function merchantRows(): { keyword: string; category: string; necessity: 'necessary' | 'neutral' | 'unnecessary' }[] {
  const rows: { keyword: string; category: string; necessity: 'necessary' | 'neutral' | 'unnecessary' }[] = [];
  const seen = new Set<string>();
  for (const [category, blob] of Object.entries(M)) {
    // tokens are separated by whitespace, but keywords can contain spaces: split on the ":x" markers.
    const re = /([^:]+?):([unm])(?=\s|$)/g;
    let m: RegExpExecArray | null;
    const text = blob.replace(/\s+/g, ' ').trim();
    while ((m = re.exec(text))) {
      const keyword = m[1].trim().toLowerCase();
      if (!keyword || seen.has(keyword)) continue;
      seen.add(keyword);
      rows.push({
        keyword,
        category,
        necessity: m[2] === 'u' ? 'unnecessary' : m[2] === 'n' ? 'necessary' : 'neutral',
      });
    }
  }
  return rows;
}

export const BADGES = [
  { id: 'first_log', name: 'First Log', emoji: '🌱', description: 'Logged your very first expense', rule: 'expenses >= 1', sort: 1 },
  { id: 'streak_7', name: '7-Day Streak', emoji: '🔥', description: 'Logged 7 days in a row', rule: 'streak >= 7', sort: 2 },
  { id: 'streak_30', name: '30-Day Streak', emoji: '🏆', description: 'Logged 30 days in a row', rule: 'streak >= 30', sort: 3 },
  { id: 'expenses_100', name: '100 Expenses', emoji: '💯', description: 'Logged 100 expenses', rule: 'expenses >= 100', sort: 4 },
  { id: 'zero_regret', name: 'Zero Regret Week', emoji: '😇', description: 'A full week with no Unnecessary spend', rule: 'week unnecessary = 0', sort: 5 },
  { id: 'budget_ninja', name: 'Budget Ninja', emoji: '🥷', description: 'Met every category budget in a month', rule: 'all budgets met', sort: 6 },
  { id: 'goal_getter', name: 'Goal Getter', emoji: '🎯', description: 'Completed your first savings goal', rule: 'goals completed >= 1', sort: 7 },
  { id: 'early_bird', name: 'Early Bird', emoji: '🌅', description: 'Logged before 10 am on 7 days', rule: 'early logs >= 7 days', sort: 8 },
  { id: 'comeback_kid', name: 'Comeback Kid', emoji: '💪', description: 'Restarted a streak after a break', rule: 'new streak >= 3 after a break', sort: 9 },
  { id: 'voice_logger', name: 'Voice Logger', emoji: '🎙️', description: 'Logged 10 expenses by voice', rule: 'voice entries >= 10', sort: 10 },
  { id: 'sentence_smith', name: 'Sentence Smith', emoji: '✍️', description: 'Logged 10 expenses by typing a sentence', rule: 'text entries >= 10', sort: 11 },
  { id: 'wishlist_warrior', name: 'Wishlist Warrior', emoji: '🧘', description: 'Skipped 3 items on the cool-off list', rule: 'skipped >= 3', sort: 12 },
  { id: 'target_hitter', name: 'Target Hitter', emoji: '📉', description: 'Hit your weekly savings target', rule: 'weekly target hit', sort: 13 },
  { id: 'challenger', name: 'Challenger', emoji: '⚔️', description: 'Completed a challenge', rule: 'challenge completed', sort: 14 },
];

export const CHALLENGES = [
  {
    id: 'no_swiggy_week',
    name: 'No Swiggy Week',
    emoji: '🥡',
    description: 'Seven days with zero food-delivery orders (Swiggy, Zomato and friends).',
    rule_json: { type: 'no_keyword', keywords: ['swiggy', 'zomato', 'dominos', 'eatsure', 'faasos', 'box8', 'behrouz', 'kfc', 'mcdonalds', 'pizza hut'] },
    reward: 250,
    duration_days: 7,
  },
  {
    id: 'daily_cap_500',
    name: '₹500/day cap',
    emoji: '🧢',
    description: 'Keep every day under ₹500 (rent, EMIs and SIPs excluded) for a week.',
    rule_json: { type: 'daily_cap', cap: 500, exclude: ['Rent & Housing', 'EMI & Loans', 'Investments & Savings', 'Bills & Utilities'] },
    reward: 300,
    duration_days: 7,
  },
  {
    id: 'zero_regret_3',
    name: '3 Days, Zero Regret',
    emoji: '😇',
    description: 'No Unnecessary expense for three days straight.',
    rule_json: { type: 'no_necessity', necessity: 'unnecessary' },
    reward: 150,
    duration_days: 3,
  },
  {
    id: 'cab_free_week',
    name: 'Cab-free Week',
    emoji: '🚇',
    description: 'No Ola, Uber or Rapido for 7 days — metro, bus and walking only.',
    rule_json: { type: 'no_keyword', keywords: ['ola', 'uber', 'rapido', 'cab', 'taxi', 'blusmart'] },
    reward: 200,
    duration_days: 7,
  },
  {
    id: 'home_cooked',
    name: 'Ghar ka Khana',
    emoji: '🍛',
    description: 'Keep Food & Dining under ₹1,000 for a week.',
    rule_json: { type: 'category_cap', category: 'Food & Dining', cap: 1000 },
    reward: 300,
    duration_days: 7,
  },
  {
    id: 'subscription_detox',
    name: 'Subscription Detox',
    emoji: '📵',
    description: 'No new Entertainment & Subscriptions spend for 14 days.',
    rule_json: { type: 'no_category', category: 'Entertainment & Subscriptions' },
    reward: 400,
    duration_days: 14,
  },
  {
    id: 'no_spend_weekend',
    name: 'No-spend Weekend',
    emoji: '🏡',
    description: 'Spend nothing on Saturday and Sunday (bills excluded).',
    rule_json: { type: 'no_spend_weekend', exclude: ['Rent & Housing', 'EMI & Loans', 'Investments & Savings', 'Bills & Utilities'] },
    reward: 200,
    duration_days: 7,
  },
];

export const REWARDS = [
  { id: 'freeze', name: 'Streak Freeze', emoji: '🧊', description: 'Protects one missed day. Hold up to 2.', cost_coins: 200, type: 'freeze', value: '1', sort: 1 },
  { id: 'frame_silver', name: 'Silver avatar frame', emoji: '🥈', description: 'A silver ring around your avatar.', cost_coins: 150, type: 'frame', value: 'silver', sort: 6 },
  { id: 'frame_gold', name: 'Gold avatar frame', emoji: '🥇', description: 'A gold ring around your avatar.', cost_coins: 400, type: 'frame', value: 'gold', sort: 7 },
  { id: 'frame_rangoli', name: 'Rangoli avatar frame', emoji: '🌸', description: 'Colourful festive frame.', cost_coins: 500, type: 'frame', value: 'rangoli', sort: 8 },
  { id: 'icons_pack', name: 'Custom category icons', emoji: '🎨', description: 'Unlock 40 extra emoji icons for your categories.', cost_coins: 250, type: 'icons', value: 'pack1', sort: 9 },
  { id: 'advanced_analytics', name: 'Advanced analytics', emoji: '🔬', description: 'Mood patterns, micro-spend tracker and cost-in-hours details.', cost_coins: 800, type: 'analytics', value: 'on', sort: 10 },
  { id: 'coupon_coming', name: 'Partner coupons', emoji: '🎟️', description: 'Cashback vouchers from partners — coming soon.', cost_coins: 2000, type: 'real_world', value: null, sort: 11, available: false },
  { id: 'tree_coming', name: 'Plant a tree', emoji: '🌳', description: 'Donate coins to plant a tree — coming soon.', cost_coins: 1500, type: 'real_world', value: null, sort: 12, available: false },
];

export const LEVELS = [
  { level: 1, name: 'Paisa Starter', min: 0 },
  { level: 2, name: 'Budget Builder', min: 500 },
  { level: 3, name: 'Smart Saver', min: 1500 },
  { level: 4, name: 'Money Master', min: 4000 },
  { level: 5, name: 'Wealth Wizard', min: 10000 },
];

export const EXTRA_ICONS = '🍕🍔☕🧋🍜🥗🚕🚗🏍️🚲⛽🎮🎧📱💻🎁🎂💍👗👟👜💄🧴🐶🐱🌿🏋️🧘⚽🏏🎸🎨📷🧳🏖️⛰️🕌🛕⛪💐🍼'.match(/\p{Extended_Pictographic}(️)?/gu) || [];
export const BASE_ICONS = ['🏷️', '🍽️', '🛒', '🛺', '✈️', '🛍️', '💡', '🏠', '🎬', '💊', '📚', '💇', '🪔', '🏦', '📈', '📦', '🎉', '🐾', '👶', '🧾'];
