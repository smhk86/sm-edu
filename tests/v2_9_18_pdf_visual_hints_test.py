import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'backend'))
from app import main as mod
class Page:
    def __init__(self,text,drawings=0): self.text=text; self.drawings=drawings
    def get_text(self,kind):
        return {'blocks':[{'type':0,'lines':[{'spans':[{'text':self.text}]}]}]}
    def find_tables(self):
        class T: tables=[]
        return T()
    def get_drawings(self): return [{}]*self.drawings

def test_geometry_and_chart_classification():
    g=mod._analyze_pdf_page_layout(Page('في المثلث ABC الزاوية A تساوي 30°، يمثل المنحنى تغير السرعة'),1)
    assert 'geometry' in g['visual_content_types']
    assert 'chart_or_graph' in g['visual_content_types']
    assert g['measurement_policy']=='never_infer_lengths_or_angles_from_drawing_scale'
    assert g['visual_review_recommended'] is False  # text-only hints do not imply embedded visual evidence

def test_complex_visuals_are_flagged_without_claiming_recognition():
    g=mod._analyze_pdf_page_layout(Page('نص غير مصنف',drawings=12),2)
    assert 'unclassified_visual' in g['visual_content_types']
    assert g['visual_confidence']=='low'
    assert 'classification_is_heuristic_not_vision_recognition' in g['limitations']

if __name__=='__main__':
    test_geometry_and_chart_classification();test_complex_visuals_are_flagged_without_claiming_recognition()
    print('PASS: v2.9.19 PDF visual hint classification and conservative measurement safeguards')
