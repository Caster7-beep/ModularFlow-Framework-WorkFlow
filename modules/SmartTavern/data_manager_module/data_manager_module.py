import os
import json
from core.function_registry import register_function
from core.services import get_service_manager, get_current_globals
from . import variables as v

@register_function(name="data.load_all", outputs=["loaded_data_summary"])
def load_all_data_from_storage():
    """
    扫描当前项目的共享数据目录，加载所有类型的数据到全局变量 g。
    """
    service_manager = get_service_manager()
    g = get_current_globals()
    summary = {}
    
    if not g:
        summary["error"] = "全局变量不可用"
        return {"loaded_data_summary": summary}

    # 获取当前项目的共享数据路径
    data_storage_path = service_manager.get_shared_path()
    if not data_storage_path:
        summary["error"] = "无法获取共享数据路径"
        return {"loaded_data_summary": summary}

    for data_type, (subdir, global_var_name, is_list) in v.DATA_MAPPING.items():
        full_path = data_storage_path / subdir
        
        if not full_path.is_dir():
            print(f"警告: 数据目录不存在: {full_path}")
            setattr(g, global_var_name, [] if is_list else {})
            summary[data_type] = {"status": "skipped", "reason": "directory not found"}
            continue

        loaded_items = []
        
        for filename in os.listdir(full_path):
            if filename.endswith(".json"):
                file_path = full_path / filename
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if is_list:
                            if isinstance(data, list):
                                loaded_items.extend(data)
                            else:
                                loaded_items.append(data)
                        else:
                            setattr(g, global_var_name, data)
                            summary[data_type] = {"status": "loaded", "source": filename, "count": 1}
                            break
                except Exception as e:
                    print(f"错误: 加载文件失败 {file_path}: {e}")

        if is_list:
            setattr(g, global_var_name, loaded_items)
            summary[data_type] = {"status": "loaded", "count": len(loaded_items)}
            
    for data_type, (subdir, global_var_name, is_list) in v.DATA_MAPPING.items():
        if not is_list and not hasattr(g, global_var_name):
            setattr(g, global_var_name, {})
            summary.setdefault(data_type, {"status": "loaded", "count": 0})

    return {"loaded_data_summary": summary}
