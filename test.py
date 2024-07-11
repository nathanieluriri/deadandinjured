# import streamlit as st
# import pandas as pd
# st.title("Test")

# # Create a DataFrame
# data = {
#     'Name': ['John', 'Anna', 'Peter'],
#     'Age': [28, 24, 35],
#     'City': ['New York', 'Paris', 'Berlin']
# }
# df = pd.DataFrame(data)
# st.write(df)
# st.dataframe(df,width=600)

# s= [{"role":"creator","guess":"yooo wassup","secret number":"ssss"},{"role":"joiner","content":"yooo wassup"},{"role":"creator","content":"yooo wassup"},{"role":"joiner","content":"yooo wassup"}]

# @st.experimental_dialog("Create your unique number")
# def create():
#     one,two,thr,four=st.columns(4)

#     with one:
#         st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="one")
#     with two:
#         st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="two")
#     with thr:
#         st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="thr")
#     with four:
#         st.number_input(label="enter a number",label_visibility="collapsed",min_value=0,max_value=9,key="four")

# create()

def calculate_dead(PlayersGuess, OpponentsCode):
    """
    Calculate the number of 'dead' values (correct number in the correct position).
    """
    dead = 0
    for i in range(4):
        if PlayersGuess[i] == OpponentsCode[i]:
            dead += 1
    return dead

def calculate_injured(PlayersGuess, OpponentsCode):
    """
    Calculate the number of 'injured' values (correct number in the wrong position).
    """
    injured = 0
    for i in range(4):
        if PlayersGuess[i] != OpponentsCode[i] and PlayersGuess[i] in OpponentsCode:
            injured += 1
    return injured


PlayersGuess = [4, 3, 2,  1]  # Example input
OpponentsCode = [4, 3, 2, 1]  # Example input

# Calculate dead and injured values
dead = calculate_dead(PlayersGuess, OpponentsCode)
injured = calculate_injured(PlayersGuess, OpponentsCode)

print(f"Dead: {dead}, Injured: {injured}")
