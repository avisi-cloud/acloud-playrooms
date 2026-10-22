import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface WizardStep {
  key: string;
  label: string;
  icon: string;
  /** Set when the step's own state decides its tick; left out, a step is ticked once passed. */
  done?: boolean;
}

/**
 * Presentational step navigation for the create wizards. Emits the clicked
 * index; the parent validates the change and updates [activeIndex].
 */
@Component({
  selector: 'app-wizard-stepper',
  imports: [],
  templateUrl: './wizard-stepper.html',
  styleUrl: './wizard-stepper.css',
  // Purely presentational: immutable inputs in, an event out.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardStepper {
  @Input({ required: true }) steps: WizardStep[] = [];
  @Input() activeIndex = 0;
  @Output() stepSelect = new EventEmitter<number>();

  /** The active step keeps its own marker, so the tick never hides where the user is. */
  showsAsDone(step: WizardStep, index: number): boolean {
    return index !== this.activeIndex && (step.done ?? index < this.activeIndex);
  }
}
