import json, sys, traceback
from pathlib import Path
sys.path.insert(0, r'C:\Users\ANKUR\OneDrive - Indus International School\Documents\table_tennis_app-full-project\cv_service')
from app import document_pages, recognize, bracket_ocr_engine
from predict_bracket import draft

batch = Path(sys.argv[1])
outdir = batch / 'predictions'
outdir.mkdir(exist_ok=True)
engine = bracket_ocr_engine()
rows = []
for pdf in sorted(batch.glob('*.pdf')):
    gt = json.loads(pdf.with_suffix('.json').read_text(encoding='utf-8'))
    try:
        data = pdf.read_bytes()
        pages = document_pages(data, 'application/pdf')
        lines = []
        for i, image in enumerate(pages, 1):
            lines.extend(recognize(image, i, engine))
        pred = draft(lines)
        (outdir / (pdf.stem + '.prediction.json')).write_text(json.dumps({'raw_ocr_lines':lines,'structureDraft':pred},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        actual = {int(s['slot_number']): (s['slot_type'] == 'BYE', s.get('player_name')) for s in gt['slots']}
        predicted = {int(e['slot']):(False,e['name']) for e in pred['entries']}
        predicted.update({int(slot):(True,None) for slot in pred['byeSlotNumbers']})
        all_slots = sorted(set(actual) | set(predicted))
        slot_exact = sum(actual.get(s) == predicted.get(s) for s in all_slots)
        player_slots = [s for s,(is_bye,_) in actual.items() if not is_bye]
        name_exact = sum(actual.get(s,(None,None))[1] == predicted.get(s,(None,None))[1] for s in player_slots)
        name_ci = sum((actual.get(s,(None,None))[1] or '').casefold() == (predicted.get(s,(None,None))[1] or '').casefold() for s in player_slots)
        bye_truth = {s for s,(is_bye,_) in actual.items() if is_bye}
        bye_pred = set(pred['byeSlotNumbers'])
        rows.append({'file':pdf.name,'pages':len(pages),'expected_slots':len(actual),'predicted_slot_count':len(pred['bracketSlots']),'expected_entrants':len(player_slots),'predicted_entrants':len(pred['entries']),'expected_byes':sorted(bye_truth),'predicted_byes':sorted(bye_pred),'bye_correct':sorted(bye_truth & bye_pred),'bye_missing':sorted(bye_truth-bye_pred),'bye_extra':sorted(bye_pred-bye_truth),'slot_exact':slot_exact,'slot_total':len(all_slots),'name_exact':name_exact,'name_casefold':name_ci,'name_total':len(player_slots),'missing_slots':pred['review']['missingSlots'],'duplicate_slots':pred['review']['duplicateSlots'],'wrong_or_missing_names':[{'slot':s,'expected':actual[s][1],'predicted':predicted.get(s,(None,None))[1]} for s in player_slots if (actual[s][1] or '').casefold() != (predicted.get(s,(None,None))[1] or '').casefold()],'error':None})
    except Exception as e:
        rows.append({'file':pdf.name,'error':f'{type(e).__name__}: {e}','traceback':traceback.format_exc()})
completed=[r for r in rows if not r.get('error')]
summary={'batch':'ChatGPT-provided held-out batch 05','method':'Same inference functions as /api/draw/recognize: PDF render, PP-OCRv5 mobile OCR, trained BYE line classifier, structural draft. JSON labels loaded only after prediction for scoring.','files':len(rows),'successful_files':len(completed),'failed_files':len(rows)-len(completed),'slot_exact_total':sum(r['slot_exact'] for r in completed),'slot_total':sum(r['slot_total'] for r in completed),'name_exact_total':sum(r['name_exact'] for r in completed),'name_casefold_total':sum(r['name_casefold'] for r in completed),'name_total':sum(r['name_total'] for r in completed),'bye_tp':sum(len(r['bye_correct']) for r in completed),'bye_fn':sum(len(r['bye_missing']) for r in completed),'bye_fp':sum(len(r['bye_extra']) for r in completed),'results':rows}
report = batch / 'evaluation_report.json'
report.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
