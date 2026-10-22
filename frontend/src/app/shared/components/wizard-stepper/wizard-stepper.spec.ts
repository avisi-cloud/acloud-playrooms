import { WizardStep, WizardStepper } from './wizard-stepper';

const step = (key: string, done?: boolean): WizardStep => ({ key, label: key, icon: '', done });

describe('WizardStepper', () => {
  // How the create wizards use it: they leave `done` out.
  it('ticks the steps behind the active one when they report nothing', () => {
    const stepper = new WizardStepper();
    stepper.activeIndex = 1;

    expect(stepper.showsAsDone(step('a'), 0)).toBe(true);
    expect(stepper.showsAsDone(step('b'), 1)).toBe(false);
    expect(stepper.showsAsDone(step('c'), 2)).toBe(false);
  });

  it('ticks a step by its own state when it reports one', () => {
    const stepper = new WizardStepper();
    stepper.activeIndex = 1;

    expect(stepper.showsAsDone(step('a', false), 0)).toBe(false);
    expect(stepper.showsAsDone(step('c', true), 2)).toBe(true);
  });

  it('never ticks the active step, so it keeps showing where the user is', () => {
    const stepper = new WizardStepper();
    stepper.activeIndex = 1;

    expect(stepper.showsAsDone(step('b', true), 1)).toBe(false);
  });
});
