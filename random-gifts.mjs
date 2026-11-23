const minimumDelay = 20;
const delayRange = 15;

export function createRandomGifts(slots, random = Math.random) {
  let enabled = false;
  let due = Infinity;

  function reset(time) {
    due = enabled ? time + minimumDelay + random() * delayRange : Infinity;
  }

  return {
    setEnabled(value, time) {
      enabled = value;
      reset(time);
    },
    reset,
    next(time, levelComplete) {
      if (levelComplete || time < due) return null;
      reset(time);
      return slots[Math.floor(random() * slots.length)];
    },
  };
}
