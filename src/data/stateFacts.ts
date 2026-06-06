import type { StateFeature } from "./states";
import { GENERATED_STATE_FACTS } from "./stateFactsData";

/**
 * Curated one-liners for U.S. states (keyed by lowercase name). Other
 * countries' subdivisions fall back to a "{type} of {country}" line.
 */
const US_STATE_FACTS: Record<string, string> = {
  alabama: "Heart of the Deep South; pivotal in the Civil Rights Movement.",
  alaska: "Largest U.S. state by area; vast wilderness bought from Russia in 1867.",
  arizona: "Home of the Grand Canyon and the Sonoran Desert.",
  arkansas: "'The Natural State'; birthplace of Walmart and Bill Clinton.",
  california: "Most populous state; home to Silicon Valley and Hollywood.",
  colorado: "Rocky Mountain hub for skiing and outdoor recreation.",
  connecticut: "Wealthy New England state; insurance capital (Hartford).",
  delaware: "First state to ratify the Constitution; corporate-friendly laws.",
  "district of columbia": "The U.S. capital district — seat of the federal government.",
  florida: "'The Sunshine State'; Disney World, beaches, and NASA's Cape Canaveral.",
  georgia: "Atlanta is a business & transport hub; Coca-Cola's home.",
  hawaii: "Volcanic Pacific island chain; the only U.S. island state.",
  idaho: "Famous for potatoes and rugged mountain wilderness.",
  illinois: "Home of Chicago, a major financial and architectural center.",
  indiana: "'The Crossroads of America'; hosts the Indy 500.",
  iowa: "Leading corn and agriculture state; first presidential caucuses.",
  kansas: "Great Plains wheat country at the geographic heart of the U.S.",
  kentucky: "Bourbon, bluegrass, and the Kentucky Derby.",
  louisiana: "New Orleans, jazz, Creole cuisine, and Mardi Gras.",
  maine: "Northeasternmost state; lobster, lighthouses, and rocky coast.",
  maryland: "Chesapeake Bay crab country; home to the U.S. Naval Academy.",
  massachusetts: "Birthplace of the American Revolution; Harvard and MIT.",
  michigan: "Auto industry heartland (Detroit); bordered by the Great Lakes.",
  minnesota: "'Land of 10,000 Lakes'; known for cold winters and the Mall of America.",
  mississippi: "Deep South state along its namesake river; blues music roots.",
  missouri: "Gateway to the West (St. Louis Arch); barbecue and jazz.",
  montana: "'Big Sky Country'; Glacier National Park and wide-open ranches.",
  nebraska: "Great Plains farming and cattle state.",
  nevada: "Las Vegas, casinos, and the Mojave Desert.",
  "new hampshire": "'Live Free or Die'; first-in-the-nation primary; fall foliage.",
  "new jersey": "Densely populated; Atlantic City boardwalk and Jersey Shore.",
  "new mexico": "'Land of Enchantment'; desert mesas and nuclear research (Los Alamos).",
  "new york": "Home of New York City — global finance, media, and culture.",
  "north carolina": "Research Triangle tech hub; first powered flight at Kitty Hawk.",
  "north dakota": "Oil-boom plains state (Bakken formation).",
  ohio: "Industrial Midwest swing state; the Rock & Roll Hall of Fame.",
  oklahoma: "Native American heritage; oil, tornadoes, and the Dust Bowl.",
  oregon: "Pacific Northwest; forests, coffee culture, and Crater Lake.",
  pennsylvania: "Birthplace of the U.S. (Philadelphia); steel and the Liberty Bell.",
  "rhode island": "Smallest U.S. state; historic Newport mansions.",
  "south carolina": "Antebellum history; Charleston and Atlantic beaches.",
  "south dakota": "Home of Mount Rushmore and the Badlands.",
  tennessee: "Music capitals: Nashville (country) and Memphis (blues, Elvis).",
  texas: "2nd-largest state; oil, cattle, and a booming tech scene (Austin).",
  utah: "Mormon heritage (Salt Lake City); national parks and red rock.",
  vermont: "Green Mountains; maple syrup and progressive politics.",
  virginia: "Birthplace of presidents; the Pentagon and colonial history.",
  washington: "Pacific NW tech giant — home of Microsoft, Amazon, and Boeing.",
  "west virginia": "Appalachian coal country with rugged mountain terrain.",
  wisconsin: "'America's Dairyland'; cheese, beer, and Green Bay Packers.",
  wyoming: "Least populous state; home of Yellowstone, the first national park.",
};

/** A best-effort one-liner about a clicked state/province. */
export function stateFact(feature: StateFeature, countryName: string): string {
  const name = feature.__name.toLowerCase();

  // 1. Generated + fact-checked facts (most countries).
  const generated = GENERATED_STATE_FACTS[`${feature.__country}:${name}`];
  if (generated) return generated;

  // 2. Hand-curated US states.
  if (feature.__country === "USA") {
    const fact = US_STATE_FACTS[name];
    if (fact) return fact;
  }

  // 3. Generic fallback.
  const type = feature.__type || "subdivision";
  return `A ${type.toLowerCase()} of ${countryName}.`;
}
