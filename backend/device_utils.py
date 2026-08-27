import logging
import torch

logger = logging.getLogger(__name__)

_cuda_functional: bool | None = None


def is_cuda_functional() -> bool:
    """
    Checks whether PyTorch CUDA is not only available according to the GPU driver,
    but also actually capable of executing CUDA kernels on this machine's GPU architecture.
    """
    global _cuda_functional
    if _cuda_functional is not None:
        return _cuda_functional

    if not torch.cuda.is_available():
        _cuda_functional = False
        return False

    try:
        # Perform a lightweight operation to verify kernel execution support
        _ = torch.zeros(1, device="cuda") + 1
        _cuda_functional = True
    except Exception as exc:
        logger.warning(
            "CUDA is reported available by driver, but kernel execution failed (%s). "
            "Falling back to CPU for PyTorch models.",
            exc,
        )
        _cuda_functional = False

    return _cuda_functional


def get_device() -> torch.device:
    """Returns torch.device('cuda') if CUDA execution is functional, else torch.device('cpu')."""
    return torch.device("cuda" if is_cuda_functional() else "cpu")
