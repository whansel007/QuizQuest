// Student-facing descriptions for the abilities shown in each Library hero book.
// Cooldowns and icons continue to come from the arena's shared game config.
export const HERO_ABILITY_GUIDE = Object.freeze({
  sheriff: {
    primary: 'Fire a quick revolver shot in the aimed direction.',
    skill: 'Throw dynamite that explodes on impact or at the end of its flight, damaging nearby enemies.',
    ultimate: 'For 5 seconds, hold primary fire to unleash a rapid stream of revolver shots.',
  },
  guardian: {
    primary: 'Throw your shield at an enemy to deal damage.',
    skill: 'Rush toward your aim, then strike a wide fan of enemies. You are briefly protected during the rush.',
    ultimate: 'Charge through enemies while protected, building power from hits before finishing with a heavy slam.',
  },
  pilot: {
    primary: 'Fire a pellet spread; in Mech Suit, deliver an explosive punch.',
    skill: 'Dash away; in Mech Suit, dash forward and deal damage.',
    ultimate: 'Enter Mech Suit for 12 seconds. Max HP rises and refills; attacks and defense improve.',
  },
  bombardier: {
    primary: 'Throw a bomb that explodes on impact or after traveling, damaging enemies around it.',
    skill: 'Place a trap at your feet. It explodes when an enemy comes close.',
    ultimate: 'Choose a target area, then rain bombs across it after a warning.',
  },
  bubbles: {
    primary: 'Spray a stream of bubbles toward your aim.',
    skill: 'Launch a bubble that traps the first enemy it hits, then bursts for area damage. Weakened targets take a larger finishing burst.',
    ultimate: 'Become a fast-moving bubble for a short time, damaging enemies you rush through.',
  },
  electromancer: {
    primary: 'Launch a lightning orb that can pierce through enemies.',
    skill: 'Fire a stun orb that bursts on impact, damaging and stunning enemies in its area.',
    ultimate: 'Send lightning jumping between nearby enemies, striking each link in the chain.',
  },
  fairy: {
    primary: 'Fire a wind arrow that pierces an enemy and pushes them back.',
    skill: 'Send a burst of wind that damages and pushes enemies in a wide area.',
    ultimate: 'Launch a vortex that pulls enemies together and damages them before pushing them away.',
  },
  engineer: {
    primary: 'Throw a wrench to mark enemies; catch it on its return.',
    skill: 'Place up to two nearby turrets; they lose HP over time.',
    ultimate: 'Fire a charged laser through enemies.',
  },
  samurai: {
    primary: 'Throw a shuriken that damages and knocks enemies back.',
    skill: 'Dash toward your aim and slash enemies in your path.',
    ultimate: 'Dash through enemies with a powerful afterimage cut. Its strength grows with your kill streak.',
  },
  ranger: {
    primary: 'Hold to charge your bow, then release to fire a stronger, longer-ranged arrow.',
    skill: 'Throw meat to call your wolf companion, who attacks nearby enemies for 8 seconds.',
    ultimate: 'For 10 seconds, your next three bow releases fire powerful arrows that explode on impact.',
  },
});
