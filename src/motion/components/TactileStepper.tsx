import React, {useCallback} from 'react';
import {playHoverTick, readStoredSoundEnabled} from '../../immersive/soundEngine';

export interface StepItem {
  id: string;
  label: string;
  description?: string;
}

export interface TactileStepperProps {
  steps: StepItem[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * TactileStepper
 *
 * 灵感来源于 Aceternity UI Timeline / Multi-Step Stepper 与 Uiverse Neo-Brutalism Tag Chips。
 * 为复杂或多步骤学生工具（报名照制作、PDF 页面合并等）提供带触觉音效、流光进度连线与清晰状态指示的高质感步骤条。
 */
export const TactileStepper: React.FC<TactileStepperProps> = ({
  steps,
  currentStepIndex,
  onStepClick,
  className = '',
}) => {
  const safeCurrent = Math.max(0, Math.min(currentStepIndex, steps.length - 1));
  const progressRatio =
    steps.length > 1 ? (safeCurrent / (steps.length - 1)) * 100 : 100;

  const handleStepClick = useCallback(
    (index: number) => {
      if (!onStepClick) return;
      playHoverTick(readStoredSoundEnabled());
      onStepClick(index);
    },
    [onStepClick],
  );

  return (
    <nav
      className={`tactile-stepper ${className}`}
      aria-label="操作步骤"
      data-current-step={safeCurrent}
    >
      <div className="tactile-stepper-track" aria-hidden="true">
        <div
          className="tactile-stepper-progress"
          style={{width: `${progressRatio}%`}}
        />
      </div>

      <ol className="tactile-stepper-list">
        {steps.map((step, idx) => {
          const isCompleted = idx < safeCurrent;
          const isCurrent = idx === safeCurrent;
          const isPending = idx > safeCurrent;
          const isClickable = Boolean(onStepClick);

          return (
            <li
              key={step.id || idx}
              className={`tactile-step-item ${
                isCompleted ? 'is-completed' : ''
              } ${isCurrent ? 'is-current' : ''} ${
                isPending ? 'is-pending' : ''
              }`}
            >
              <button
                type="button"
                className="tactile-step-button"
                disabled={!isClickable}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => handleStepClick(idx)}
              >
                <span className="tactile-step-badge">
                  {isCompleted ? (
                    <svg
                      className="tactile-step-check"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                  ) : (
                    <span className="tactile-step-number">{idx + 1}</span>
                  )}
                </span>

                <div className="tactile-step-info">
                  <span className="tactile-step-label">{step.label}</span>
                  {step.description && (
                    <span className="tactile-step-desc">{step.description}</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
