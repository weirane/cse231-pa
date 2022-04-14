glob: int = 0


def func(x: int) -> bool:
    y: bool = False
    if x > 0:
        return y
    else:
        return not y


print(func(glob))
