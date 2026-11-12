import { useState } from 'react';
import { copyLocal } from '../tool-common';
import { ToolPage, useJob } from './common';
import {
  ACTIVITY_LEVELS,
  BMR_FORMULA,
  BODY_FAT_METHOD,
  GENDER_LABELS,
  HEALTHY_BMI,
  LIMITS,
  computeBmi,
  computeEnergy,
  estimateBodyFat,
  type ActivityLevelId,
  type BmiResult,
  type BodyFatResult,
  type EnergyResult,
  type Gender,
} from './health-core';
import './health.css';

interface HealthResult {
  gender: Gender;
  age: number;
  bmi: BmiResult;
  bodyFat: BodyFatResult | null;
  energy: EnergyResult;
}

function NumberField({
  label,
  value,
  min,
  max,
  integer = false,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  integer?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        min={min}
        max={max}
        step={integer ? 1 : 0.1}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** 生成可直接复制的纯文本结果；不含任何用户文件或网络信息。 */
function reportText(result: HealthResult, activity: ActivityLevelId): string {
  const selected = result.energy.rows.find((row) => row.id === activity) ?? result.energy.rows[0];
  const lines = [
    'NOVIP · BMI / 体脂率参考计算（参考值，非诊断）',
    `性别：${GENDER_LABELS[result.gender]}；年龄：${result.age} 岁；身高：${result.bmi.heightCm} cm；体重：${result.bmi.weightKg} kg`,
    `BMI：${result.bmi.bmi.toFixed(1)}（${result.bmi.category.label}，中国成人分类 ${result.bmi.category.rangeText}）`,
    `健康体重参考（BMI ${HEALTHY_BMI.min}–${HEALTHY_BMI.max}）：${result.bmi.healthyWeightKg.min.toFixed(1)}–${result.bmi.healthyWeightKg.max.toFixed(1)} kg`,
  ];
  if (result.bodyFat) {
    lines.push(
      `体脂率估算：${result.bodyFat.percent.toFixed(1)}%（${result.bodyFat.category.label} ${result.bodyFat.category.text}）；方法：${BODY_FAT_METHOD}，估算≠医疗测量`,
    );
  } else {
    lines.push('体脂率估算：本次未填写围度，未计算');
  }
  lines.push(`BMR：${Math.round(result.energy.bmr)} kcal/日（Mifflin-St Jeor 公式）`);
  lines.push(`TDEE（${selected.label} ×${selected.factor}）：约 ${Math.round(selected.tdee)} kcal/日`);
  lines.push('※ 以上为按公开公式的本地估算，仅作参考，不构成医疗诊断、治疗建议或饮食处方。');
  return lines.join('\n');
}

export default function Health() {
  const job = useJob();
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [neck, setNeck] = useState('');
  const [hip, setHip] = useState('');
  const [activity, setActivity] = useState<ActivityLevelId>('light');
  const [result, setResult] = useState<HealthResult>();
  const [copyMessage, setCopyMessage] = useState('');

  function fieldChange(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setResult(undefined);
      setCopyMessage('');
    };
  }

  function reset() {
    job.reset();
    setResult(undefined);
    setCopyMessage('');
    setGender('male');
    setAge('');
    setHeight('');
    setWeight('');
    setWaist('');
    setNeck('');
    setHip('');
    setActivity('light');
  }

  function calculate() {
    void job.run(
      async () => {
        const bmi = computeBmi(height, weight);
        const energy = computeEnergy({ gender, heightCm: height, weightKg: weight, age });
        const hasCircumference = Boolean(waist.trim() || neck.trim() || (gender === 'female' && hip.trim()));
        const bodyFat = hasCircumference
          ? estimateBodyFat({
              gender,
              heightCm: height,
              waistCm: waist,
              neckCm: neck,
              hipCm: gender === 'female' ? hip : undefined,
            })
          : null;
        return { gender, age: Number(age), bmi, bodyFat, energy };
      },
      (value) => {
        setResult(value);
        setCopyMessage('');
      },
    );
  }

  async function copy() {
    if (!result) return;
    try {
      await copyLocal(reportText(result, activity));
      setCopyMessage('已复制结果，可直接粘贴保存；本页没有上传任何数据。');
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : '复制失败，请手动选中结果复制。');
    }
  }

  const bodyFat = result?.bodyFat;
  const selected = result
    ? result.energy.rows.find((row) => row.id === activity) ?? result.energy.rows[0]
    : undefined;

  return (
    <ToolPage
      id="health"
      title="BMI / 体脂率参考计算"
      description="输入身高、体重和围度，按公开公式在本机估算 BMI、体脂率、基础代谢（BMR）与每日热量参考（TDEE）。全部计算在浏览器完成，不上传任何数据，也不提供医疗诊断。"
      job={job}
    >
      <section className="health-callout" role="note" aria-label="使用提示">
        <strong>参考值，非诊断。</strong>
        <p>
          结果由公开公式按你填写的数值估算，不能替代医院检查、体成分检测（如 DEXA）或医生、注册营养师的判断。孕期、哺乳期、服药中或有慢性疾病时，请先咨询专业人士。
        </p>
      </section>

      <section className="study-card">
        <h2>
          <span className="study-step">1</span>填写你的数据
        </h2>
        <div className="study-fields">
          <label>
            性别
            <select
              value={gender}
              disabled={job.busy}
              onChange={(event) => {
                setGender(event.target.value as Gender);
                setResult(undefined);
                setCopyMessage('');
              }}
            >
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>
          <NumberField
            label={`年龄（${LIMITS.age.min}–${LIMITS.age.max} 岁，整数）`}
            value={age}
            min={LIMITS.age.min}
            max={LIMITS.age.max}
            integer
            placeholder="如 25"
            disabled={job.busy}
            onChange={fieldChange(setAge)}
          />
          <NumberField
            label="身高（cm）"
            value={height}
            min={LIMITS.heightCm.min}
            max={LIMITS.heightCm.max}
            placeholder="如 170"
            disabled={job.busy}
            onChange={fieldChange(setHeight)}
          />
          <NumberField
            label="体重（kg）"
            value={weight}
            min={LIMITS.weightKg.min}
            max={LIMITS.weightKg.max}
            placeholder="如 60"
            disabled={job.busy}
            onChange={fieldChange(setWeight)}
          />
        </div>

        <h3 className="health-subhead">体脂率围度（可选）</h3>
        <p className="study-note">
          想同时估算体脂率时填写：腰围在肚脐水平、放松呼气后测量；颈围在喉结下方；女性另需臀部最宽处的臀围。三项都用厘米，围度误差会直接影响估算结果。
        </p>
        <div className="study-fields">
          <NumberField
            label="腰围（cm）"
            value={waist}
            min={LIMITS.circumferenceCm.min}
            max={LIMITS.circumferenceCm.max}
            placeholder="如 80"
            disabled={job.busy}
            onChange={fieldChange(setWaist)}
          />
          <NumberField
            label="颈围（cm）"
            value={neck}
            min={LIMITS.circumferenceCm.min}
            max={LIMITS.circumferenceCm.max}
            placeholder="如 38"
            disabled={job.busy}
            onChange={fieldChange(setNeck)}
          />
          {gender === 'female' && (
            <NumberField
              label="臀围（cm，女性必填）"
              value={hip}
              min={LIMITS.circumferenceCm.min}
              max={LIMITS.circumferenceCm.max}
              placeholder="如 95"
              disabled={job.busy}
              onChange={fieldChange(setHip)}
            />
          )}
        </div>

        <label>
          日常活动水平（用于计算 TDEE）
          <select
            value={activity}
            disabled={job.busy}
            onChange={(event) => {
              setActivity(event.target.value as ActivityLevelId);
              setResult(undefined);
              setCopyMessage('');
            }}
          >
            {ACTIVITY_LEVELS.map((level) => (
              <option key={level.id} value={level.id}>
                {level.label}（×{level.factor}）：{level.detail}
              </option>
            ))}
          </select>
        </label>

        <div className="study-actions">
          <button className="study-btn" type="button" disabled={job.busy} onClick={calculate}>
            计算参考值
          </button>
          <button className="study-btn alt" type="button" disabled={job.busy} onClick={reset}>
            清空
          </button>
        </div>
      </section>

      {result && (
        <section className="study-card" aria-live="polite">
          <h2>
            <span className="study-step">2</span>参考结果
          </h2>
          <p className="health-stamp">参考值，非诊断 · 全部在本机计算 · 刷新即清空</p>

          <div className="health-result">
            <h3>BMI（身体质量指数）</h3>
            <p className="health-value">
              <strong>{result.bmi.bmi.toFixed(1)}</strong>
              <span className="health-badge">{result.bmi.category.label}</span>
            </p>
            <p>
              中国成人分类：{result.bmi.category.label}（{result.bmi.category.rangeText}）。
            </p>
            <p>
              按你的身高 {result.bmi.heightCm} cm，健康体重参考区间为{' '}
              <strong>
                {result.bmi.healthyWeightKg.min.toFixed(1)}–{result.bmi.healthyWeightKg.max.toFixed(1)} kg
              </strong>
              （对应 BMI {HEALTHY_BMI.min}–{HEALTHY_BMI.max}）。
            </p>
            <p className="study-note">
              中国成人分类依据《成人体重判定》（WS/T 428-2013）：偏瘦 &lt;18.5、正常 18.5–23.9、超重
              24.0–27.9、肥胖 ≥28.0。与 WHO 国际标准不同（WHO 将 25.0–29.9 计为超重、≥30.0 计为肥胖）。BMI
              不区分脂肪与肌肉，肌肉发达者可能被高估；未成年人不适用成人分类。仅作参考。
            </p>
          </div>

          <div className="health-result">
            <h3>体脂率估算（美国海军围度公式）</h3>
            {bodyFat ? (
              <>
                <p className="health-value">
                  <strong>
                    {bodyFat.percent.toFixed(1)}
                    <small>%</small>
                  </strong>
                  <span className="health-badge">{bodyFat.category.label}</span>
                </p>
                <p>
                  ACE 公开参考分级：{bodyFat.category.label}（{bodyFat.category.text}）。
                </p>
                <ul className="health-reference">
                  {bodyFat.reference.map((row) => (
                    <li key={row.level} className={row.level === bodyFat.category.level ? 'on' : ''}>
                      <span>{row.label}</span>
                      <b>{row.text}</b>
                    </li>
                  ))}
                </ul>
                <p className="study-note">
                  估算 ≠ 医疗测量：{BODY_FAT_METHOD}属于回归估算，围度测量位置与松紧、呼吸状态都会影响结果，不能替代
                  DEXA、水下称重等专业检测，也不作为健康、训练或减脂诊断。分级来源：美国运动医学会（ACE）公开体脂参考区间，其他机构标准可能不同。
                </p>
              </>
            ) : (
              <p className="study-note">
                本次没有填写围度，所以只计算了 BMI 与热量参考。填写腰围、颈围（女性另需臀围）后重新计算，可同时得到体脂率估算。
              </p>
            )}
          </div>

          <div className="health-result">
            <h3>BMR / TDEE 每日热量参考</h3>
            <p className="health-value">
              <strong>{Math.round(result.energy.bmr)}</strong>
              <span>kcal/日 · 基础代谢率（BMR）</span>
            </p>
            <div className="health-table-wrap">
              <table className="health-tdee">
                <thead>
                  <tr>
                    <th scope="col">活动水平</th>
                    <th scope="col">系数</th>
                    <th scope="col">每日热量参考</th>
                  </tr>
                </thead>
                <tbody>
                  {result.energy.rows.map((row) => (
                    <tr key={row.id} className={row.id === activity ? 'on' : ''}>
                      <td>
                        {row.label}
                        <small>{row.detail}</small>
                      </td>
                      <td>×{row.factor}</td>
                      <td>{Math.round(row.tdee)} kcal</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected && (
              <p>
                你选择的活动水平：{selected.label}（×{selected.factor}），每日热量参考约{' '}
                <strong>{Math.round(selected.tdee)} kcal</strong>。
              </p>
            )}
            <p className="study-note">
              BMR 采用 Mifflin-St Jeor 公式：{BMR_FORMULA}。TDEE = BMR × 活动系数。以上只是参考值，非处方：体重管理请结合饮食、运动与医生或注册营养师建议，不要长期低于基础代谢进食。
            </p>
          </div>

          <div className="study-actions">
            <button className="study-btn" type="button" onClick={() => void copy()}>
              复制结果
            </button>
          </div>
          {copyMessage && (
            <p role="status" className="study-note">
              {copyMessage}
            </p>
          )}
        </section>
      )}
    </ToolPage>
  );
}
