import os
import sys
import json
import argparse
import time
import traceback
from pathlib import Path
from typing import Dict, Any, Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start Visual WorkFlow API Gateway from any working directory."
    )
    parser.add_argument(
        "--background",
        action="store_true",
        default=False,
        help="Run server in background (non-blocking). Default: False",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=6502,
        help="API gateway port. Default: 6502",
    )
    return parser.parse_args()


def build_project_config(port: int) -> Dict[str, Any]:
    # Only gateway-related config kept minimal as required
    return {
        "project": {
            "name": "VisualWorkFlow",
            "display_name": "Visual WorkFlow",
            "version": "1.0.0",
            "description": "Visual WorkFlow API Server",
        },
        "backend": {
            "api_gateway": {
                "enabled": True,
                "port": int(port),
                "cors_origins": ["http://localhost:3002"],
            },
            "websocket": {"enabled": True, "path": "/ws"},
        },
    }


def main():
    try:
        # 1) Resolve repository root and make it importable
        script_path = Path(__file__).resolve()
        root = script_path.parents[2]  # repo root: .../ModularFlow-Framework-WorkFlow
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        os.chdir(str(root))
        print(f"[boot] Root: {root}")
        print(f"[boot] CWD : {Path.cwd()}")

        # 2) Delayed imports after sys.path injection and chdir
        from core.services import (
            register_project,
            switch_project,
            get_service_manager,
            get_current_globals,
        )
        from modules.api_gateway_module import get_api_gateway
        import modules.visual_workflow_module.visual_workflow_module as vwm
        import modules.visual_workflow_module.optimized_visual_workflow_module as ovwm
        import modules.visual_workflow_module.llm_api_bridge as llm_bridge

        # 3) Parse CLI args
        args = parse_args()
        port = int(args.port) if args.port else 6502

        # 4) Ensure project registered and switched
        ensured = False
        try:
            switched = switch_project("VisualWorkFlow")
            ensured = bool(switched)
        except Exception:
            ensured = False
        if not ensured:
            try:
                register_project(
                    name="VisualWorkFlow",
                    namespace="VisualWorkFlow",
                    shared_path="shared/VisualWorkFlow",
                    modules_path="modules",
                )
                switch_project("VisualWorkFlow")
            except Exception:
                print("[error] Failed to register/switch project 'VisualWorkFlow'")
                raise

        # 5) Inject Gemini provider config from environment into current project globals
        try:
            g = get_current_globals()
            if g is not None:
                # Read environment variables
                gemini_api_key = os.environ.get("GEMINI_API_KEY")
                base_url = os.environ.get(
                    "GEMINI_BASE_URL",
                    "https://generativelanguage.googleapis.com/v1beta",
                )
                models_str = os.environ.get("GEMINI_MODELS", "gemini-2.5-flash")
                models = [m.strip() for m in str(models_str).split(",") if m.strip()]

                # Ensure providers container
                if not hasattr(g, "api_providers") or not isinstance(
                    getattr(g, "api_providers", None), dict
                ):
                    g.api_providers = {}

                provider_cfg = {
                    "api_key": gemini_api_key or "",
                    "base_url": base_url,
                    "models": models,
                    "enable_api_key": True,
                    "enabled": True,
                }

                # Inject both title-case and lower-case keys for compatibility
                g.api_providers["Gemini"] = dict(provider_cfg)
                g.api_providers["gemini"] = dict(provider_cfg)

                # Set active provider to gemini
                g.active_api_provider = "gemini"

                # Clear LLM manager cache for gemini so it will rebuild with new config
                try:
                    if hasattr(g, "_llm_managers") and isinstance(
                        getattr(g, "_llm_managers", None), dict
                    ):
                        if "gemini" in g._llm_managers:
                            del g._llm_managers["gemini"]
                except Exception:
                    # Do not block startup on cache cleanup issues
                    pass

                # Print non-sensitive summary
                if not gemini_api_key:
                    print("[warn] GEMINI_API_KEY not set; Gemini provider will be inactive until provided.")
                print(f"[LLM] Active Provider: {getattr(g, 'active_api_provider', None)}, Models: {models}")
        except Exception as inj_err:
            # Do not fail server startup on injection errors; print tail for diagnostics
            print(f"[warn] LLM provider injection failed: {inj_err}")

        # 6) Build config and start API gateway
        project_config = build_project_config(port=port)
        gateway = get_api_gateway(project_config=project_config)
        print("[boot] Starting API Gateway...")
        gateway.start_server(background=bool(args.background))

        # 7) Print endpoints
        print(f"[ready] API Gateway running on port {port}")
        print("       Endpoints:")
        print(f"       - http://localhost:{port}/health")
        print(f"       - http://localhost:{port}/info")
        print(f"       - http://localhost:{port}/docs")
        print(f"       - WS: ws://localhost:{port}/ws")

        # 8) Keep main thread alive if background mode
        if args.background:
            print("[bg] Server running in background. Press Ctrl+C to exit this launcher.")
            try:
                while True:
                    time.sleep(3600)
            except KeyboardInterrupt:
                print("\n[bg] Launcher exiting. Background server thread will be stopped by process exit.")
        else:
            # Foreground mode: uvicorn blocks inside start_server.
            pass

    except SystemExit:
        raise
    except Exception:
        print("[fatal] Startup failed:")
        print("-------- Traceback (most recent call last, tail) --------")
        tb_lines = traceback.format_exc().splitlines()
        tail = tb_lines[-12:] if len(tb_lines) > 12 else tb_lines
        for line in tail:
            print(line)
        sys.exit(1)


if __name__ == "__main__":
    main()