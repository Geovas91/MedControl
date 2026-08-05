import test from "node:test";
import assert from "node:assert/strict";
import { calculateBmi, formNullableBoolean, optionalNumber, parseVitalForm, validateVitalInput } from "../../lib/patients/clinical.ts";
import { normalizePatientListQuery, normalizePatientSearch } from "../../lib/patients/query.ts";

test("calcula IMC con peso y estatura y redondea a dos decimales",()=>{
  assert.equal(calculateBmi(70,175),22.86);
  assert.equal(calculateBmi(null,175),null);
  assert.equal(calculateBmi(70,0),null);
});

test("acepta una medición parcial y no inventa valores ausentes",()=>{
  const form=new FormData();form.set("measured_at","2026-08-04T10:30");form.set("temperature_c","37.2");
  const input=parseVitalForm(form);
  assert.equal(validateVitalInput(input),null);assert.equal(input.temperatureC,37.2);assert.equal(input.weightKg,null);
});

test("exige justificación para excepciones clínicas y valida dolor",()=>{
  const form=new FormData();form.set("measured_at","2026-08-04T10:30");form.set("temperature_c","48");
  assert.match(validateVitalInput(parseVitalForm(form))??"",/justificación/);
  form.set("outlier_justification","Confirmado con segundo termómetro");
  assert.equal(validateVitalInput(parseVitalForm(form)),null);
  form.delete("temperature_c");form.set("pain_scale","11");
  assert.match(validateVitalInput(parseVitalForm(form))??"",/0 y 10/);
});

test("convierte campos numéricos vacíos a null",()=>{
  assert.equal(optionalNumber(""),null);assert.equal(optionalNumber("  "),null);assert.equal(optionalNumber("72.5"),72.5);
});

test("normaliza búsqueda y filtros de pacientes sin aceptar paginación inválida",()=>{
  assert.equal(normalizePatientSearch("  Ana   López +52  "),"Ana López +52");
  assert.deepEqual(normalizePatientListQuery({q:" ana@example.com ",status:"active",page:"2",pageSize:"20"}),{search:"ana@example.com",status:"active",page:2,pageSize:20});
  assert.equal(normalizePatientListQuery({page:"-1",status:"deleted"}).page,1);
});

test("preserva antecedentes familiares sin registrar como null",()=>{
  const form=new FormData();
  assert.equal(formNullableBoolean(form,"diabetes"),null);
  form.set("diabetes","no");assert.equal(formNullableBoolean(form,"diabetes"),false);
  form.set("diabetes","yes");assert.equal(formNullableBoolean(form,"diabetes"),true);
});
