-- Clear cached forecasts for a material (run after Prophet unit/settings fixes).
USE spareai;

DELETE FROM forecast_cache WHERE material_code = '70410600080047';
