/**
 * The learner's real life. Injected into every LLM prompt so generated sentences are about
 * things Nir actually says and does. Edit freely.
 */
export const PERSONA = {
  name: 'ניר',
  city: 'תל אביב',
  job: 'קופירייטר בפרסום',
  habits: ['שותה אספרסו', 'הולך למשחקי הפועל תל אביב'],
};

export const PERSONA_PROMPT = `The learner is ${PERSONA.name}, a Hebrew speaker who lives in Tel Aviv, works as an advertising copywriter, drinks espresso every day, and goes to Hapoel Tel Aviv football matches. Whenever it fits naturally, build the sentence around his real life (Tel Aviv streets and cafes, copywriting and campaigns, espresso, the stadium and the fans) instead of generic textbook situations. Never force it if the target word does not fit.`;
